"use client";

import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer, CircleMarker, Tooltip } from "react-leaflet";
import type { Stadium } from "@/lib/engine/types";

export default function MatchMap({ stadium }: { stadium: Stadium }) {
  return (
    <MapContainer
      key={stadium.id}
      center={[stadium.lat, stadium.lng]}
      zoom={13}
      scrollWheelZoom={false}
      style={{ height: "100%", width: "100%" }}
      attributionControl
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; OpenStreetMap'
      />
      <CircleMarker
        center={[stadium.lat, stadium.lng]}
        radius={11}
        pathOptions={{
          color: "#34e39b",
          fillColor: "#34e39b",
          fillOpacity: 0.35,
          weight: 3,
        }}
      >
        <Tooltip permanent direction="top" offset={[0, -10]}>
          <span style={{ fontWeight: 700 }}>{stadium.name}</span>
        </Tooltip>
      </CircleMarker>
    </MapContainer>
  );
}
