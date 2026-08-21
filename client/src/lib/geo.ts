/**
 * Style reminder — Night Transit Map: calculations stay transparent and feed a vivid, legible map.
 */

export type Station = { id: string; name: string; lat: number; lng: number; line: string; prefecture: string };
export type RouteInput = { startStation: Station; homeStation: Station | null };
const HEART_RAILS_ENDPOINT = "https://express.heartrails.com/api/json";
type HeartRailsStation = { name: string; x: string; y: string; line?: string; prefecture?: string };

function normalizeStation(raw: HeartRailsStation, index = 0): Station | null {
  const lat = Number(raw.y); const lng = Number(raw.x);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { id: `${raw.name}-${raw.line ?? ""}-${lat}-${lng}-${index}`, name: raw.name, lat, lng, line: raw.line ?? "路線情報なし", prefecture: raw.prefecture ?? "" };
}
async function requestStations(params: Record<string, string>) {
  const query = new URLSearchParams({ method: "getStations", ...params });
  const response = await fetch(`${HEART_RAILS_ENDPOINT}?${query.toString()}`);
  if (!response.ok) throw new Error("駅データを取得できませんでした。");
  const data = (await response.json()) as { response?: { station?: HeartRailsStation[] } };
  return (data.response?.station ?? []).map((station, index) => normalizeStation(station, index)).filter((station): station is Station => station !== null);
}
export async function searchStations(query: string) { if (!query.trim()) return []; const stations = await requestStations({ name: query.trim() }); return Array.from(new Map(stations.map(station => [station.id, station])).values()).slice(0, 8); }
export async function getLineStations(line: string) { if (!line || line === "路線情報なし") return []; return requestStations({ line }); }
export async function getNearestStation(lat: number, lng: number) { return requestStations({ x: lng.toString(), y: lat.toString() }); }

export function haversineKm(a: Pick<Station, "lat" | "lng">, b: Pick<Station, "lat" | "lng">) {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180; const earthRadiusKm = 6371;
  const latDiff = toRadians(b.lat - a.lat); const lngDiff = toRadians(b.lng - a.lng);
  const arc = Math.sin(latDiff / 2) ** 2 + Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(lngDiff / 2) ** 2;
  return earthRadiusKm * (2 * Math.atan2(Math.sqrt(arc), Math.sqrt(1 - arc)));
}
export function pointToSegmentKm(point: Pick<Station, "lat" | "lng">, a: Pick<Station, "lat" | "lng">, b: Pick<Station, "lat" | "lng">) {
  const referenceLatitude = ((a.lat + b.lat + point.lat) / 3) * (Math.PI / 180); const kmPerDegreeLat = 110.574; const kmPerDegreeLng = 111.32 * Math.cos(referenceLatitude);
  const ax = a.lng * kmPerDegreeLng; const ay = a.lat * kmPerDegreeLat; const bx = b.lng * kmPerDegreeLng; const by = b.lat * kmPerDegreeLat; const px = point.lng * kmPerDegreeLng; const py = point.lat * kmPerDegreeLat;
  const dx = bx - ax; const dy = by - ay; const lengthSquared = dx * dx + dy * dy; const progress = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared));
  return Math.hypot(px - (ax + progress * dx), py - (ay + progress * dy));
}
export function interpolatePoint(a: Station, b: Station, progress: number) { return { lat: a.lat + (b.lat - a.lat) * progress, lng: a.lng + (b.lng - a.lng) * progress }; }
export function distanceToRouteKm(point: Pick<Station, "lat" | "lng">, route: RouteInput) { return route.homeStation ? pointToSegmentKm(point, route.startStation, route.homeStation) : haversineKm(point, route.startStation); }

export function pickBestStation<T extends { startStation: Station; homeStation: Station | null }>(participants: T[], candidates: Station[]) {
  const scored = candidates.map(station => { const individualKm = participants.map(participant => distanceToRouteKm(station, participant)); return { station, totalKm: individualKm.reduce((total, km) => total + km, 0), individualKm }; });
  return scored.reduce<{ station: Station; totalKm: number; individualKm: number[] } | null>((best, candidate) => !best || candidate.totalKm < best.totalKm ? candidate : best, null);
}

function closestPointOnSegment(point: Pick<Station, "lat" | "lng">, a: Station, b: Station) {
  const referenceLatitude = ((a.lat + b.lat + point.lat) / 3) * (Math.PI / 180); const kmPerDegreeLat = 110.574; const kmPerDegreeLng = 111.32 * Math.cos(referenceLatitude);
  const ax = a.lng * kmPerDegreeLng; const ay = a.lat * kmPerDegreeLat; const bx = b.lng * kmPerDegreeLng; const by = b.lat * kmPerDegreeLat; const px = point.lng * kmPerDegreeLng; const py = point.lat * kmPerDegreeLat; const dx = bx - ax; const dy = by - ay; const denominator = dx * dx + dy * dy; const t = denominator === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / denominator));
  return { lat: (ay + t * dy) / kmPerDegreeLat, lng: (ax + t * dx) / kmPerDegreeLng };
}

/** Finds the continuous geometric median of each participant's commute segment or departure point. */
export function findOptimalPoint(routes: RouteInput[]) {
  if (!routes.length) return null;
  const anchors = routes.flatMap(route => [route.startStation, ...(route.homeStation ? [route.homeStation] : [])]);
  let point = { lat: anchors.reduce((sum, station) => sum + station.lat, 0) / anchors.length, lng: anchors.reduce((sum, station) => sum + station.lng, 0) / anchors.length };
  for (let iteration = 0; iteration < 160; iteration += 1) {
    const targets = routes.map(route => route.homeStation ? closestPointOnSegment(point, route.startStation, route.homeStation) : route.startStation);
    const weights = targets.map(target => 1 / Math.max(haversineKm(point, target), 0.000001)); const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
    const next = targets.reduce((sum, target, index) => ({ lat: sum.lat + target.lat * weights[index], lng: sum.lng + target.lng * weights[index] }), { lat: 0, lng: 0 }); next.lat /= weightSum; next.lng /= weightSum;
    if (haversineKm(point, next) < 0.001) { point = next; break; } point = next;
  }
  const individualKm = routes.map(route => distanceToRouteKm(point, route)); return { point, individualKm, totalKm: individualKm.reduce((sum, distance) => sum + distance, 0) };
}
