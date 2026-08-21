/**
 * Style reminder — Night Transit Map: the map is the primary canvas; route color is data, not decoration.
 */

import { useEffect } from "react";
import { CircleMarker, MapContainer, Marker, Polyline, Popup, TileLayer, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import type { Station } from "@/lib/geo";
import "leaflet/dist/leaflet.css";

export type MapParticipant = {
  id: string;
  name: string;
  color: string;
  startStation: Station | null;
  homeStation: Station | null;
};

type BestStation = {
  station: Station;
  totalKm: number;
  individualKm: number[];
};

type RadarMapProps = {
  participants: MapParticipant[];
  result: BestStation | null;
};

function FitBounds({ participants, result }: RadarMapProps) {
  const map = useMap();
  useEffect(() => {
    const points = participants.flatMap(participant =>
      [participant.startStation, participant.homeStation]
        .filter((station): station is Station => Boolean(station))
        .map(station => [station.lat, station.lng] as [number, number]),
    );
    if (result) points.push([result.station.lat, result.station.lng]);
    if (points.length > 1) map.fitBounds(L.latLngBounds(points), { padding: [54, 54], maxZoom: 12 });
    if (points.length === 1) map.setView(points[0], 12);
  }, [map, participants, result]);
  return null;
}

function endpointIcon(color: string, kind: "office" | "home") {
  const glyph = kind === "office" ? "●" : "◆";
  return L.divIcon({
    className: "radar-marker-shell",
    html: `<div class="route-marker" style="--marker-color:${color}"><span>${glyph}</span></div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

const targetIcon = L.divIcon({
  className: "radar-marker-shell",
  html: '<div class="target-marker"><span>◎</span></div>',
  iconSize: [56, 56],
  iconAnchor: [28, 28],
});

export default function RadarMap({ participants, result }: RadarMapProps) {
  return (
    <MapContainer className="radar-map" center={[35.6812, 139.7671]} zoom={10} scrollWheelZoom>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        crossOrigin="anonymous"
      />
      <FitBounds participants={participants} result={result} />
      {participants.map(participant => {
        if (!participant.startStation || !participant.homeStation) return null;
        return (
          <Polyline
            key={`${participant.id}-route`}
            positions={[
              [participant.startStation.lat, participant.startStation.lng],
              [participant.homeStation.lat, participant.homeStation.lng],
            ]}
            pathOptions={{ color: participant.color, weight: 6, opacity: 0.86, lineCap: "round" }}
          >
            <Tooltip sticky direction="top" className="route-tooltip">
              {participant.name}の移動線
            </Tooltip>
          </Polyline>
        );
      })}
      {participants.map(participant => {
        if (!participant.startStation || !participant.homeStation) return null;
        return (
          <span key={`${participant.id}-points`}>
            <Marker position={[participant.startStation.lat, participant.startStation.lng]} icon={endpointIcon(participant.color, "office")}>
              <Popup>
                <strong>{participant.name}の出発駅</strong><br />
                {participant.startStation.name}（{participant.startStation.line}）
              </Popup>
            </Marker>
            <Marker position={[participant.homeStation.lat, participant.homeStation.lng]} icon={endpointIcon(participant.color, "home")}>
              <Popup>
                <strong>{participant.name}の帰宅駅</strong><br />
                {participant.homeStation.name}（{participant.homeStation.line}）
              </Popup>
            </Marker>
          </span>
        );
      })}
      {result && (
        <>
          <CircleMarker
            center={[result.station.lat, result.station.lng]}
            radius={34}
            pathOptions={{ color: "#c6f36b", weight: 1, fillColor: "#c6f36b", fillOpacity: 0.11 }}
          />
          <Marker position={[result.station.lat, result.station.lng]} icon={targetIcon} zIndexOffset={800}>
            <Popup>
              <strong>集合候補：{result.station.name}</strong><br />
              全員の移動線からの距離合計：{result.totalKm.toFixed(1)} km
            </Popup>
          </Marker>
        </>
      )}
    </MapContainer>
  );
}
