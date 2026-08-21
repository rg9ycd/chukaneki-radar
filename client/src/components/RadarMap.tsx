/**
 * Style reminder — Night Transit Map: the map is the primary canvas; route color is data, not decoration.
 */

import { useEffect } from "react";
import { CircleMarker, MapContainer, Marker, Polyline, Popup, TileLayer, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import type { Station } from "@/lib/geo";
import "leaflet/dist/leaflet.css";

export type MapParticipant = { id: string; name: string; color: string; startStation: Station | null; homeStation: Station | null };
export type MapResult = { mode: "station" | "point"; point: Pick<Station, "lat" | "lng">; station?: Station; totalKm: number; individualKm: number[]; candidateCount: number };
type RadarMapProps = { participants: MapParticipant[]; result: MapResult | null };

function FitBounds({ participants, result }: RadarMapProps) {
  const map = useMap();
  useEffect(() => {
    const points = participants.flatMap(participant => [participant.startStation, participant.homeStation].filter((station): station is Station => Boolean(station)).map(station => [station.lat, station.lng] as [number, number]));
    if (result) points.push([result.point.lat, result.point.lng]);
    if (points.length > 1) map.fitBounds(L.latLngBounds(points), { padding: [52, 52], maxZoom: 12 });
    if (points.length === 1) map.setView(points[0], 12);
  }, [map, participants, result]);
  return null;
}

function endpointIcon(color: string, kind: "office" | "home") { const glyph = kind === "office" ? "●" : "◆"; return L.divIcon({ className: "radar-marker-shell", html: `<div class="route-marker" style="--marker-color:${color}"><span>${glyph}</span></div>`, iconSize: [30, 30], iconAnchor: [15, 15] }); }
const stationTargetIcon = L.divIcon({ className: "radar-marker-shell", html: '<div class="target-marker"><span>◎</span></div>', iconSize: [56, 56], iconAnchor: [28, 28] });
const pointTargetIcon = L.divIcon({ className: "radar-marker-shell", html: '<div class="target-marker point-target"><span>+</span></div>', iconSize: [56, 56], iconAnchor: [28, 28] });

function closestPointOnRoute(point: Pick<Station, "lat" | "lng">, start: Station, home: Station) {
  const referenceLatitude = ((point.lat + start.lat + home.lat) / 3) * (Math.PI / 180); const latScale = 110.574; const lngScale = 111.32 * Math.cos(referenceLatitude);
  const ax = start.lng * lngScale; const ay = start.lat * latScale; const bx = home.lng * lngScale; const by = home.lat * latScale; const px = point.lng * lngScale; const py = point.lat * latScale; const dx = bx - ax; const dy = by - ay; const denominator = dx * dx + dy * dy;
  const progress = denominator === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / denominator));
  return { lat: (ay + progress * dy) / latScale, lng: (ax + progress * dx) / lngScale };
}

export default function RadarMap({ participants, result }: RadarMapProps) {
  return <MapContainer className="radar-map" center={[35.6812, 139.7671]} zoom={10} scrollWheelZoom>
    <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" crossOrigin="anonymous" />
    <FitBounds participants={participants} result={result} />
    {participants.map(participant => {
      if (!participant.startStation) return null;
      if (participant.homeStation) return <Polyline key={`${participant.id}-route`} positions={[[participant.startStation.lat, participant.startStation.lng], [participant.homeStation.lat, participant.homeStation.lng]]} pathOptions={{ color: participant.color, weight: 6, opacity: 0.86, lineCap: "round" }}><Tooltip sticky direction="top" className="route-tooltip">{participant.name}の移動線</Tooltip></Polyline>;
      return result ? <Polyline key={`${participant.id}-distance`} positions={[[participant.startStation.lat, participant.startStation.lng], [result.point.lat, result.point.lng]]} pathOptions={{ color: participant.color, weight: 3, opacity: 0.62, dashArray: "6 9", lineCap: "round" }}><Tooltip sticky direction="top" className="route-tooltip">{participant.name}の出発地点から</Tooltip></Polyline> : null;
    })}
    {result ? participants.map((participant, index) => {
      if (!participant.startStation || !participant.homeStation) return null;
      const projection = closestPointOnRoute(result.point, participant.startStation, participant.homeStation);
      return <span key={`${participant.id}-helper`}><Polyline positions={[[result.point.lat, result.point.lng], [projection.lat, projection.lng]]} pathOptions={{ color: participant.color, weight: 2, opacity: 0.92, dashArray: "3 8", lineCap: "round" }}><Tooltip sticky direction="top" className="route-tooltip">{participant.name}の移動線まで {result.individualKm[index]?.toFixed(1)} km</Tooltip></Polyline><CircleMarker center={[projection.lat, projection.lng]} radius={4} pathOptions={{ color: participant.color, weight: 2, fillColor: "#07111f", fillOpacity: 1 }} /></span>;
    }) : null}
    {participants.map(participant => participant.startStation ? <span key={`${participant.id}-points`}><Marker position={[participant.startStation.lat, participant.startStation.lng]} icon={endpointIcon(participant.color, "office")}><Popup><strong>{participant.name}の出発駅</strong><br />{participant.startStation.name}（{participant.startStation.line}）</Popup></Marker>{participant.homeStation ? <Marker position={[participant.homeStation.lat, participant.homeStation.lng]} icon={endpointIcon(participant.color, "home")}><Popup><strong>{participant.name}の帰宅駅</strong><br />{participant.homeStation.name}（{participant.homeStation.line}）</Popup></Marker> : null}</span> : null)}
    {result ? <><CircleMarker center={[result.point.lat, result.point.lng]} radius={34} pathOptions={{ color: "#c6f36b", weight: 1, fillColor: "#c6f36b", fillOpacity: 0.11 }} /><Marker position={[result.point.lat, result.point.lng]} icon={result.mode === "station" ? stationTargetIcon : pointTargetIcon} zIndexOffset={800}><Popup><strong>{result.mode === "station" ? `集合候補：${result.station?.name}駅` : "計算上の最適地点"}</strong><br />{result.mode === "station" ? result.station?.line : `緯度 ${result.point.lat.toFixed(5)} / 経度 ${result.point.lng.toFixed(5)}`}<br />距離合計：{result.totalKm.toFixed(1)} km</Popup></Marker></> : null}
  </MapContainer>;
}
