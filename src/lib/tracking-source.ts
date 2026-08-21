import type { GeoPoint, TripTracking } from "@/types/tracking";

/**
 * Fonte de posição do motorista.
 *
 * Trocar mock por produção é substituir apenas este módulo:
 * a implementação real faz `fetch("/api/chamados/{id}/tracking")`,
 * alimentada pelas posições que o app do motorista envia via
 * `navigator.geolocation.watchPosition()`.
 */
export interface TrackingSource {
  fetchTrip: (ticketId: string) => Promise<TripTracking | null>;
}

/** Intervalo de polling em ms. */
export const POLL_INTERVAL_MS = 15_000;

// --- Geografia base (Fortaleza/CE) ---

const ORIGIN: GeoPoint = { lat: -3.7436, lng: -38.4899 };
const DESTINATION: GeoPoint = { lat: -3.7327, lng: -38.5267 };

/** Interpolação linear entre dois pontos. */
function lerp(a: GeoPoint, b: GeoPoint, t: number): GeoPoint {
  return {
    lat: a.lat + (b.lat - a.lat) * t,
    lng: a.lng + (b.lng - a.lng) * t,
  };
}

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

/**
 * Mock: a corrida avança conforme o tempo decorrido desde o primeiro acesso,
 * completando o trajeto em ~6 minutos. Um leve desvio lateral evita a
 * aparência de linha reta perfeita.
 */
const TRIP_DURATION_MS = 6 * 60 * 1000;
const startedAt = new Map<string, number>();

function progressFor(ticketId: string): number {
  const now = Date.now();
  if (!startedAt.has(ticketId)) startedAt.set(ticketId, now);
  const elapsed = now - (startedAt.get(ticketId) ?? now);
  return Math.min(1, elapsed / TRIP_DURATION_MS);
}

function pathPoint(t: number): GeoPoint {
  const base = lerp(ORIGIN, DESTINATION, t);
  // Curvatura suave: máxima no meio do percurso, nula nas pontas.
  const sway = Math.sin(t * Math.PI) * 0.0045;
  return { lat: base.lat - sway, lng: base.lng };
}

export const mockTrackingSource: TrackingSource = {
  async fetchTrip(ticketId) {
    const t = progressFor(ticketId);
    const current = pathPoint(t);
    const previous = pathPoint(Math.max(0, t - 0.02));

    const trail: GeoPoint[] = [];
    for (let i = 0; i <= 24; i += 1) {
      const step = (t * i) / 24;
      trail.push(pathPoint(step));
    }

    const remainingKm = distanceKm(current, DESTINATION);
    const done = t >= 1;

    return {
      ticketId,
      status: done ? "CONCLUIDA" : "EM_ROTA",
      driverName: "João Motta",
      vehicleLabel: "Fiorino · ABC-1234",
      origin: { ...ORIGIN, label: "Unidade 1" },
      destination: { ...DESTINATION, label: "Av. Dom Luís, 1200 — Aldeota" },
      position: {
        ...current,
        recordedAt: new Date().toISOString(),
        heading: bearing(previous, current),
        speed: done ? 0 : 32,
      },
      trail,
      etaMinutes: done ? 0 : Math.max(1, Math.round((1 - t) * 6)),
      remainingKm: Number(remainingKm.toFixed(1)),
      startedAtLabel: "há poucos minutos",
      hasOrigin: true,
      hasDestination: true,
    };
  },
};
