"use client";

import { useState, useTransition } from "react";
import { MapPin, Navigation, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { startTrip } from "@/lib/tracking/actions";
import { usePositionBroadcast } from "@/lib/tracking/use-position-broadcast";

export interface DriverTripControllerProps {
  ticketId: string;
  /** Corrida já iniciada? (há Trip EM_ROTA para este chamado) */
  started: boolean;
  /** Chamado já concluído/cancelado — desliga tudo. */
  finished?: boolean;
  onStarted?: () => void;
}

/**
 * Controle da corrida no app do motorista (kanban de Motoristas).
 *
 * Antes de iniciar: botão "Iniciar corrida" → startTrip (cria o Trip e liga o
 * rastreamento). Depois de iniciada e enquanto não concluída: liga o emissor
 * de GPS (usePositionBroadcast) e mostra o status da transmissão.
 *
 * A emissão só roda com started && !finished — nunca antes de iniciar nem
 * depois de concluir.
 */
export function DriverTripController({
  ticketId,
  started,
  finished = false,
  onStarted,
}: DriverTripControllerProps) {
  const [isStarted, setIsStarted] = useState(started);
  const [startError, setStartError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const broadcasting = isStarted && !finished;
  const { state, lastSentLabel, error: broadcastError } = usePositionBroadcast(
    ticketId,
    broadcasting,
  );

  function handleStart() {
    setStartError(null);
    startTransition(async () => {
      const result = await startTrip({ ticketId });
      if (result.ok) {
        setIsStarted(true);
        onStarted?.();
      } else {
        setStartError(result.error ?? "Não foi possível iniciar a corrida.");
      }
    });
  }

  if (finished) {
    return (
      <div className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-muted">
        Corrida encerrada.
      </div>
    );
  }

  if (!isStarted) {
    return (
      <div className="space-y-2">
        <Button onClick={handleStart} disabled={pending} className="w-full">
          {pending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Iniciando…
            </>
          ) : (
            <>
              <Navigation className="h-4 w-4" /> Iniciar corrida
            </>
          )}
        </Button>
        {startError && (
          <p className="flex items-center gap-1.5 text-xs text-danger">
            <AlertTriangle className="h-3.5 w-3.5" /> {startError}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <span className="relative flex h-2.5 w-2.5">
          {state !== "denied" && state !== "error" && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60" />
          )}
          <span
            className={
              state === "denied" || state === "error"
                ? "relative inline-flex h-2.5 w-2.5 rounded-full bg-danger"
                : "relative inline-flex h-2.5 w-2.5 rounded-full bg-primary"
            }
          />
        </span>
        <span className="text-xs font-medium text-foreground">
          {state === "denied"
            ? "Localização negada"
            : state === "error"
              ? "Falha no envio"
              : "Transmitindo localização"}
        </span>
        <MapPin className="ml-auto h-3.5 w-3.5 text-muted" />
      </div>

      {lastSentLabel && (state === "acquiring" || state === "sending") && (
        <p className="mt-1 text-[11px] text-muted">Último envio às {lastSentLabel}</p>
      )}

      {(state === "denied" || state === "error") && broadcastError && (
        <p className="mt-1 flex items-center gap-1.5 text-[11px] text-danger">
          <AlertTriangle className="h-3 w-3" /> {broadcastError}
        </p>
      )}
    </div>
  );
}
