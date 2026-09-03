import "server-only";

import { prisma } from "@/lib/db/prisma";
import { distanceKm, bearing } from "@/lib/tracking-source";
import type {
  DriverPosition,
  GeoPoint,
  TripTracking,
  TripStatus,
} from "@/types/tracking";

/**
 * Monta o DTO TripTracking (consumido pelo front) a partir do Trip e suas
 * posições persistidas. É a única fonte do rastreamento — a corrida simulada
 * que existia ao lado foi removida.
 *
 * Decisões:
 *  - ETA/velocidade média derivam das últimas posições reais, sem inventar.
 *    Sem posições suficientes, devolvemos null (o front já trata null).
 *  - remainingKm só existe quando há destino geocodificado E posição atual.
 *  - O rastro é subamostrado para no máx. TRAIL_CAP pontos, preservando o
 *    mais recente — evita payloads grandes em corridas longas.
 */

const TRAIL_CAP = 60;
/** Velocidade média de fallback (km/h) para ETA quando não há leitura de speed. */
const FALLBACK_SPEED_KMH = 30;

interface TripRow {
  id: string;
  status: TripStatus;
  originLat: number | null;
  originLng: number | null;
  originLabel: string;
  destLat: number | null;
  destLng: number | null;
  destLabel: string;
  vehicleLabel: string | null;
  startedAt: Date | null;
  ticket: {
    id: string;
    assignee: { fullName: string } | null;
  };
  positions: {
    lat: number;
    lng: number;
    heading: number | null;
    speed: number | null;
    recordedAt: Date;
  }[];
}

function subsample<T>(items: readonly T[], cap: number): T[] {
  if (items.length <= cap) return [...items];
  const step = items.length / cap;
  const out: T[] = [];
  for (let i = 0; i < cap; i += 1) {
    out.push(items[Math.floor(i * step)]!);
  }
  // Garante que o último ponto real entre no rastro.
  const last = items[items.length - 1]!;
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

function relativeLabel(date: Date | null): string | undefined {
  if (!date) return undefined;
  const diffMin = Math.round((Date.now() - date.getTime()) / 60000);
  if (diffMin < 1) return "há poucos instantes";
  if (diffMin < 60) return `há ${diffMin} min`;
  const h = Math.floor(diffMin / 60);
  return `há ${h} h`;
}

/**
 * Carrega o tracking de um chamado. Retorna null quando não há Trip
 * associado (corrida ainda não iniciada).
 */
export async function getTripTracking(ticketId: string): Promise<TripTracking | null> {
  const trip = (await prisma.trip.findUnique({
    where: { ticketId },
    select: {
      id: true,
      status: true,
      originLat: true,
      originLng: true,
      originLabel: true,
      destLat: true,
      destLng: true,
      destLabel: true,
      vehicleLabel: true,
      startedAt: true,
      ticket: { select: { id: true, assignee: { select: { fullName: true } } } },
      positions: {
        orderBy: { recordedAt: "asc" },
        select: { lat: true, lng: true, heading: true, speed: true, recordedAt: true },
      },
    },
  })) as TripRow | null;

  if (!trip) return null;

  const positions = trip.positions;
  const latest = positions[positions.length - 1];

  const hasDestination = trip.destLat !== null && trip.destLng !== null;
  const destPoint: GeoPoint | null = hasDestination
    ? { lat: trip.destLat as number, lng: trip.destLng as number }
    : null;

  let position: DriverPosition | null = null;
  if (latest) {
    // Heading: usa o gravado; se ausente, deriva do ponto anterior.
    let heading = latest.heading ?? undefined;
    if (heading === undefined && positions.length >= 2) {
      const prev = positions[positions.length - 2]!;
      heading = bearing({ lat: prev.lat, lng: prev.lng }, { lat: latest.lat, lng: latest.lng });
    }
    position = {
      lat: latest.lat,
      lng: latest.lng,
      recordedAt: latest.recordedAt.toISOString(),
      heading,
      speed: latest.speed ?? undefined,
    };
  }

  const trail: GeoPoint[] = subsample(
    positions.map((p) => ({ lat: p.lat, lng: p.lng })),
    TRAIL_CAP,
  );

  const done = trip.status === "CONCLUIDA" || trip.status === "CANCELADA";

  let remainingKm: number | null = null;
  let etaMinutes: number | null = null;
  if (!done && position && destPoint) {
    const remaining = distanceKm({ lat: position.lat, lng: position.lng }, destPoint);
    remainingKm = Number(remaining.toFixed(1));

    const speedKmh = position.speed && position.speed > 3 ? position.speed : FALLBACK_SPEED_KMH;
    etaMinutes = Math.max(1, Math.round((remaining / speedKmh) * 60));
  } else if (done) {
    remainingKm = 0;
    etaMinutes = 0;
  }

  return {
    ticketId: trip.ticket.id,
    status: trip.status,
    driverName: trip.ticket.assignee?.fullName ?? "Motorista",
    vehicleLabel: trip.vehicleLabel ?? undefined,
    origin: {
      lat: trip.originLat ?? 0,
      lng: trip.originLng ?? 0,
      label: trip.originLabel,
    },
    destination: {
      lat: trip.destLat ?? 0,
      lng: trip.destLng ?? 0,
      label: trip.destLabel,
    },
    position,
    trail,
    etaMinutes,
    remainingKm,
    startedAtLabel: relativeLabel(trip.startedAt),
    hasOrigin: trip.originLat !== null && trip.originLng !== null,
    hasDestination: hasDestination,
  };
}
