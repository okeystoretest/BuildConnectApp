"use client";

import { useEffect, useMemo } from "react";
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import type { TripTracking } from "@/types/tracking";

/**
 * Ícones em SVG inline (data URI) para não depender dos PNGs do pacote,
 * que quebram sob o bundler do Next sem configuração extra.
 */
function pinIcon(color: string, glyph: string): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `
      <span style="
        display:flex;align-items:center;justify-content:center;
        width:28px;height:28px;border-radius:9999px;
        background:${color};color:#141024;
        font:600 11px/1 system-ui,sans-serif;
        box-shadow:0 0 0 3px rgba(0,0,0,.35);
      ">${glyph}</span>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

function vehicleIcon(heading: number): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `
      <span style="
        display:flex;align-items:center;justify-content:center;
        width:34px;height:34px;border-radius:9999px;
        background:#4ADE80;box-shadow:0 0 0 4px rgba(74,222,128,.25);
        transform:rotate(${heading}deg);
      ">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="#141024" aria-hidden="true">
          <path d="M12 2 4.5 20l7.5-4 7.5 4z"/>
        </svg>
      </span>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

/** Mantém origem, destino e motorista visíveis no enquadramento. */
function FitBounds({ trip }: { trip: TripTracking }) {
  const map = useMap();

  useEffect(() => {
    const points: [number, number][] = [];
    if (trip.hasOrigin) points.push([trip.origin.lat, trip.origin.lng]);
    if (trip.hasDestination) points.push([trip.destination.lat, trip.destination.lng]);
    if (trip.position) points.push([trip.position.lat, trip.position.lng]);

    // Sem nenhum ponto válido (sem geocodificação e sem GPS ainda), não força
    // enquadramento — evita jogar o mapa para as coordenadas 0,0.
    if (points.length === 0) return;
    map.fitBounds(L.latLngBounds(points), { padding: [48, 48], maxZoom: 16 });
    // Reenquadra só quando as pontas mudam; o movimento do motorista não
    // deve arrastar o mapa a cada atualização.
  }, [
    map,
    trip.hasOrigin,
    trip.hasDestination,
    trip.origin.lat,
    trip.origin.lng,
    trip.destination.lat,
    trip.destination.lng,
  ]);

  return null;
}

export function TripMap({ trip }: { trip: TripTracking }) {
  // Fallback de centro: GPS atual → origem geocodificada → destino → Fortaleza.
  const center = useMemo<[number, number]>(() => {
    if (trip.position) return [trip.position.lat, trip.position.lng];
    if (trip.hasOrigin) return [trip.origin.lat, trip.origin.lng];
    if (trip.hasDestination) return [trip.destination.lat, trip.destination.lng];
    return [-3.7319, -38.5267]; // Fortaleza-CE
  }, [
    trip.position,
    trip.hasOrigin,
    trip.hasDestination,
    trip.origin.lat,
    trip.origin.lng,
    trip.destination.lat,
    trip.destination.lng,
  ]);

  const trail = useMemo<[number, number][]>(
    () => trip.trail.map((point) => [point.lat, point.lng]),
    [trip.trail],
  );

  const remaining = useMemo<[number, number][]>(() => {
    if (!trip.position || !trip.hasDestination) return [];
    return [
      [trip.position.lat, trip.position.lng],
      [trip.destination.lat, trip.destination.lng],
    ];
  }, [trip.position, trip.hasDestination, trip.destination.lat, trip.destination.lng]);

  return (
    <MapContainer
      center={center}
      zoom={14}
      scrollWheelZoom
      className="h-full w-full"
      style={{ background: "hsl(var(--bc-surface-2))" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {/* Trecho restante, pontilhado */}
      {remaining.length > 0 && (
        <Polyline positions={remaining} pathOptions={{ color: "#8B84A3", weight: 3, dashArray: "6 8" }} />
      )}

      {/* Trecho percorrido */}
      {trail.length > 1 && (
        <Polyline positions={trail} pathOptions={{ color: "#4ADE80", weight: 4 }} />
      )}

      {trip.hasOrigin && (
        <Marker position={[trip.origin.lat, trip.origin.lng]} icon={pinIcon("#7C5CFF", "A")}>
          <Popup>{trip.origin.label}</Popup>
        </Marker>
      )}

      {trip.hasDestination && (
        <Marker
          position={[trip.destination.lat, trip.destination.lng]}
          icon={pinIcon("#F59E0B", "B")}
        >
          <Popup>{trip.destination.label}</Popup>
        </Marker>
      )}

      {trip.position && (
        <Marker
          position={[trip.position.lat, trip.position.lng]}
          icon={vehicleIcon(trip.position.heading ?? 0)}
        >
          <Popup>
            {trip.driverName}
            {trip.vehicleLabel ? ` · ${trip.vehicleLabel}` : ""}
          </Popup>
        </Marker>
      )}

      <FitBounds trip={trip} />
    </MapContainer>
  );
}
