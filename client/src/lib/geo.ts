/**
 * Style reminder — Night Transit Map: calculations stay transparent and feed a vivid, legible map.
 */

export type Station = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  line: string;
  prefecture: string;
};

const HEART_RAILS_ENDPOINT = "https://express.heartrails.com/api/json";

type HeartRailsStation = {
  name: string;
  x: string;
  y: string;
  line?: string;
  prefecture?: string;
};

function normalizeStation(raw: HeartRailsStation, index = 0): Station | null {
  const lat = Number(raw.y);
  const lng = Number(raw.x);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    id: `${raw.name}-${raw.line ?? ""}-${lat}-${lng}-${index}`,
    name: raw.name,
    lat,
    lng,
    line: raw.line ?? "路線情報なし",
    prefecture: raw.prefecture ?? "",
  };
}

async function requestStations(params: Record<string, string>) {
  const query = new URLSearchParams({ method: "getStations", ...params });
  const response = await fetch(`${HEART_RAILS_ENDPOINT}?${query.toString()}`);
  if (!response.ok) throw new Error("駅データを取得できませんでした。");
  const data = (await response.json()) as { response?: { station?: HeartRailsStation[] } };
  return (data.response?.station ?? [])
    .map((station, index) => normalizeStation(station, index))
    .filter((station): station is Station => station !== null);
}

export async function searchStations(query: string) {
  if (!query.trim()) return [];
  const stations = await requestStations({ name: query.trim() });
  const unique = new Map<string, Station>();
  stations.forEach(station => unique.set(station.id, station));
  return Array.from(unique.values()).slice(0, 8);
}

export async function getLineStations(line: string) {
  if (!line || line === "路線情報なし") return [];
  return requestStations({ line });
}

export async function getNearestStation(lat: number, lng: number) {
  return requestStations({ x: lng.toString(), y: lat.toString() });
}

export function haversineKm(a: Pick<Station, "lat" | "lng">, b: Pick<Station, "lat" | "lng">) {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const latDiff = toRadians(b.lat - a.lat);
  const lngDiff = toRadians(b.lng - a.lng);
  const arc =
    Math.sin(latDiff / 2) ** 2 +
    Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(lngDiff / 2) ** 2;
  return earthRadiusKm * (2 * Math.atan2(Math.sqrt(arc), Math.sqrt(1 - arc)));
}

/** Returns the shortest distance from p to segment ab using a local projected plane. */
export function pointToSegmentKm(
  point: Pick<Station, "lat" | "lng">,
  a: Pick<Station, "lat" | "lng">,
  b: Pick<Station, "lat" | "lng">,
) {
  const referenceLatitude = ((a.lat + b.lat + point.lat) / 3) * (Math.PI / 180);
  const kmPerDegreeLat = 110.574;
  const kmPerDegreeLng = 111.32 * Math.cos(referenceLatitude);
  const ax = a.lng * kmPerDegreeLng;
  const ay = a.lat * kmPerDegreeLat;
  const bx = b.lng * kmPerDegreeLng;
  const by = b.lat * kmPerDegreeLat;
  const px = point.lng * kmPerDegreeLng;
  const py = point.lat * kmPerDegreeLat;
  const dx = bx - ax;
  const dy = by - ay;
  const segmentLengthSquared = dx * dx + dy * dy;
  const progress = segmentLengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / segmentLengthSquared));
  return Math.hypot(px - (ax + progress * dx), py - (ay + progress * dy));
}

export function interpolatePoint(a: Station, b: Station, progress: number) {
  return {
    lat: a.lat + (b.lat - a.lat) * progress,
    lng: a.lng + (b.lng - a.lng) * progress,
  };
}

export function pickBestStation<T extends { startStation: Station | null; homeStation: Station | null }>(
  participants: T[],
  candidates: Station[],
) {
  const validParticipants = participants.filter(
    (participant): participant is T & { startStation: Station; homeStation: Station } =>
      Boolean(participant.startStation && participant.homeStation),
  );
  const scoredCandidates = candidates.map(station => {
    const individualKm = validParticipants.map(participant =>
      pointToSegmentKm(station, participant.startStation, participant.homeStation),
    );
    const totalKm = individualKm.reduce((total, km) => total + km, 0);
    return { station, totalKm, individualKm };
  });
  return scoredCandidates.reduce<{ station: Station; totalKm: number; individualKm: number[] } | null>(
    (best, candidate) => (!best || candidate.totalKm < best.totalKm ? candidate : best),
    null,
  );
}
