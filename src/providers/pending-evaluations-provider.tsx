"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

/** Intervalo de sincronização do contador (ms). */
export const PENDING_EVALUATIONS_POLL_MS = 60_000;

interface PendingEvaluationsValue {
  /** Avaliações pendentes do usuário logado. Zero esconde o indicador. */
  count: number;
  /** Força uma sincronização imediata (ex.: logo após enviar uma avaliação). */
  refresh: () => void;
}

const PendingEvaluationsContext = createContext<PendingEvaluationsValue | null>(null);

/**
 * Contador de avaliações pendentes, mantido em dia sem recarregar a página.
 *
 * O valor inicial vem renderizado do servidor, então o indicador já aparece
 * certo na primeira pintura — sem piscar de zero para o número real. Depois
 * ele se atualiza por polling leve, no mesmo desenho de `use-tickets-poll`:
 * pausa com a aba oculta (não faz sentido contar para quem não está olhando)
 * e re-sincroniza assim que ela volta ao primeiro plano.
 *
 * `initialCount` é reaplicado quando muda: é o que faz um `router.refresh()`
 * — disparado ao enviar uma avaliação — derrubar o número na hora, em vez de
 * esperar o próximo ciclo do poll.
 */
export function PendingEvaluationsProvider({
  initialCount,
  children,
}: {
  initialCount: number;
  children: React.ReactNode;
}) {
  const [count, setCount] = useState(initialCount);
  const inFlight = useRef(false);

  useEffect(() => {
    setCount(initialCount);
  }, [initialCount]);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    if (typeof document !== "undefined" && document.hidden) return;
    inFlight.current = true;
    try {
      const res = await fetch("/api/avaliacoes/pendentes", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { count?: number };
      if (typeof data.count === "number") setCount(data.count);
    } catch {
      // Silencioso: falha transitória de rede não deve zerar o indicador.
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    const id = setInterval(() => void load(), PENDING_EVALUATIONS_POLL_MS);
    const onVisible = () => {
      if (!document.hidden) void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  const refresh = useCallback(() => void load(), [load]);

  const value = useMemo<PendingEvaluationsValue>(() => ({ count, refresh }), [count, refresh]);

  return (
    <PendingEvaluationsContext.Provider value={value}>
      {children}
    </PendingEvaluationsContext.Provider>
  );
}

export function usePendingEvaluations(): PendingEvaluationsValue {
  const ctx = useContext(PendingEvaluationsContext);
  if (!ctx) {
    throw new Error(
      "usePendingEvaluations precisa estar dentro de <PendingEvaluationsProvider>.",
    );
  }
  return ctx;
}
