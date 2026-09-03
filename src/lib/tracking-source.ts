import type { GeoPoint } from "@/types/tracking";

/**
 * Geometria do rastreamento de corridas.
 *
 * Só funções puras — distância, rumo e o intervalo de polling — consumidas
 * pelo tracking real (`lib/tracking/trip-tracking-data`, `use-trip-tracking`),
 * que lê as posições que o app do motorista envia via
 * `navigator.geolocation.watchPosition()`.
 *
 * A corrida simulada que morava aqui (percurso interpolado em Fortaleza,
 * motorista e placa inventados, 6 minutos de trajeto) foi removida.
 */

/** Intervalo de polling em ms. */
export const POLL_INTERVAL_MS = 15_000;

/** Distância aproximada em km (Haversine). */
export function distanceKm(a: GeoPoint, b: GeoPoint): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Rumo em graus entre dois pontos. */
export function bearing(a: GeoPoint, b: GeoPoint): number {
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360;
}
