"use client";

import dynamic from "next/dynamic";
import { Clock, MapPin, Navigation, RefreshCw, RouteOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useTripTracking } from "@/lib/use-trip-tracking";
import { TRIP_STATUS_LABEL, TRIP_STATUS_TONE } from "@/types/tracking";

/**
 * O Leaflet acessa `window` na importação, então o mapa só pode
 * ser carregado no cliente.
 */
const TripMap = dynamic(() => import("./trip-map").then((m) => m.TripMap), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full rounded-none" />,
});

export interface TripTrackingPanelProps {
  ticketId: string;
  /** Rastreamento só faz sentido em chamado de motorista já iniciado. */
  enabled?: boolean;
}

export function TripTrackingPanel({ ticketId, enabled = true }: TripTrackingPanelProps) {
  const { trip, loading, error, lastUpdateLabel, refresh } = useTripTracking(ticketId, enabled);

  if (!enabled) {
    return (
      <EmptyState
        icon={<RouteOff className="h-5 w-5" />}
        title="Acompanhamento indisponível"
        description="O mapa fica disponível assim que o motorista iniciar a corrida."
      />
    );
  }

  if (loading && !trip) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-[22rem] w-full rounded-xl" />
        <Skeleton className="h-16 w-full rounded-xl" />
      </div>
    );
  }

  if (error && !trip) {
    return (
      <EmptyState
        icon={<RouteOff className="h-5 w-5" />}
        title="Não foi possível carregar o mapa"
        description={error}
      />
    );
  }

  if (!trip) return null;

  const finished = trip.status === "CONCLUIDA" || trip.status === "CANCELADA";

  return (
    <div className="space-y-3">
      <div className="h-[22rem] overflow-hidden rounded-xl border border-border">
        <TripMap trip={trip} />
      </div>

      <div className="rounded-xl border border-border bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Badge tone={TRIP_STATUS_TONE[trip.status]}>{TRIP_STATUS_LABEL[trip.status]}</Badge>
            <span className="text-sm font-medium text-foreground">{trip.driverName}</span>
            {trip.vehicleLabel && (
              <span className="text-xs text-muted">{trip.vehicleLabel}</span>
            )}
          </div>

          <button
            type="button"
            onClick={refresh}
            className="focus-ring flex items-center gap-1.5 rounded-lg bg-surface-2 px-2.5 py-1.5 text-[11px] text-muted transition-colors hover:text-foreground"
          >
            <RefreshCw className="h-3 w-3" />
            Atualizar
          </button>
        </div>

        <dl className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="flex items-start gap-2">
            <Navigation className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            <div className="min-w-0">
              <dt className="text-[10px] uppercase tracking-wide text-muted">Distância restante</dt>
              <dd className="text-sm text-foreground">
                {trip.remainingKm !== null ? `${trip.remainingKm} km` : "—"}
              </dd>
            </div>
          </div>

          <div className="flex items-start gap-2">
            <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
            <div className="min-w-0">
              <dt className="text-[10px] uppercase tracking-wide text-muted">Chegada estimada</dt>
              <dd className="text-sm text-foreground">
                {finished
                  ? "Entrega concluída"
                  : trip.etaMinutes !== null
                    ? `~${trip.etaMinutes} min`
                    : "—"}
              </dd>
            </div>
          </div>

          <div className="flex items-start gap-2">
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            <div className="min-w-0">
              <dt className="text-[10px] uppercase tracking-wide text-muted">Partida</dt>
              <dd className="truncate text-sm text-foreground">{trip.origin.label}</dd>
            </div>
          </div>

          <div className="flex items-start gap-2">
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
            <div className="min-w-0">
              <dt className="text-[10px] uppercase tracking-wide text-muted">Destino</dt>
              <dd className="truncate text-sm text-foreground">{trip.destination.label}</dd>
            </div>
          </div>
        </dl>

        {lastUpdateLabel && (
          <p className="mt-3 border-t border-border pt-3 text-[11px] text-muted">
            {finished
              ? "Rastreamento encerrado."
              : `Posição atualizada às ${lastUpdateLabel} · a cada 15s`}
          </p>
        )}
      </div>
    </div>
  );
}
