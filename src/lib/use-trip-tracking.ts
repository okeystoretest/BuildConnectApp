"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { POLL_INTERVAL_MS } from "@/lib/tracking-source";
import type { TripTracking } from "@/types/tracking";

interface UseTripTrackingResult {
  trip: TripTracking | null;
  loading: boolean;
  error: string | null;
  lastUpdateLabel: string | null;
  refresh: () => void;
}

/**
 * Consulta a posição do motorista em intervalos regulares.
 * Pausa quando a aba fica oculta e retoma ao voltar, evitando
 * requisições inúteis com o app em segundo plano.
 */
export function useTripTracking(
  ticketId: string | null,
  enabled = true,
): UseTripTrackingResult {
  const [trip, setTrip] = useState<TripTracking | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    if (!ticketId || inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await fetch(`/api/chamados/${ticketId}/tracking`, {
        cache: "no-store",
      });
      if (res.status === 404) {
        // Corrida ainda não iniciada — estado válido, não é erro.
        setTrip(null);
        setLastUpdate(new Date());
        setError(null);
        return;
      }
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = (await res.json()) as TripTracking;
      setTrip(data);
      setLastUpdate(new Date());
      setError(null);
    } catch {
      setError("Não foi possível atualizar a posição do motorista.");
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => {
    if (!ticketId || !enabled) {
      setTrip(null);
      return;
    }

    setLoading(true);
    void load();

    function start() {
      if (timer.current) return;
      timer.current = setInterval(() => void load(), POLL_INTERVAL_MS);
    }

    function stop() {
      if (!timer.current) return;
      clearInterval(timer.current);
      timer.current = null;
    }

    function onVisibility() {
      if (document.hidden) {
        stop();
      } else {
        void load();
        start();
      }
    }

    start();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [ticketId, enabled, load]);

  // Encerra o polling assim que a corrida termina.
  useEffect(() => {
    if (trip?.status === "CONCLUIDA" || trip?.status === "CANCELADA") {
      if (timer.current) {
        clearInterval(timer.current);
        timer.current = null;
      }
    }
  }, [trip?.status]);

  const lastUpdateLabel = lastUpdate
    ? lastUpdate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : null;

  return { trip, loading, error, lastUpdateLabel, refresh: () => void load() };
}
