"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ItTicket } from "@/types/it";

/** Intervalo de sincronização do board (ms). "Quase em tempo real". */
export const BOARD_POLL_INTERVAL_MS = 15_000;

type Destination = "TI" | "MOTORISTAS";

interface UseTicketsPollResult {
  tickets: readonly ItTicket[];
  /** Aplica uma atualização otimista local (antes do servidor confirmar). */
  applyOptimistic: (id: string, patch: Partial<ItTicket>) => void;
  /** Substitui a lista local (ex.: após remoção definitiva). */
  setLocal: (updater: (prev: readonly ItTicket[]) => readonly ItTicket[]) => void;
  /** Força uma sincronização imediata com o servidor. */
  refresh: () => void;
}

/**
 * Mantém a lista de chamados de um board sincronizada com o servidor via
 * polling leve (sem WebSocket). Novos chamados e movimentações feitas por
 * outros usuários aparecem em até ~15s.
 *
 * Convive com atualizações otimistas: mutações locais marcam o id como
 * "pendente" por uma janela curta, de modo que o próximo poll não reverta
 * visualmente a ação antes de o servidor tê-la persistido. Pausa quando a
 * aba está oculta e retoma ao voltar.
 */
export function useTicketsPoll(
  destination: Destination,
  initial: readonly ItTicket[],
): UseTicketsPollResult {
  const [tickets, setTickets] = useState<readonly ItTicket[]>(initial);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const inFlight = useRef(false);
  // ids com mutação otimista recente → protegidos do overwrite do poll.
  const pending = useRef<Map<string, number>>(new Map());
  const OPTIMISTIC_TTL = 12_000;

  const load = useCallback(async () => {
    if (inFlight.current) return;
    if (typeof document !== "undefined" && document.hidden) return;
    inFlight.current = true;
    try {
      const res = await fetch(`/api/chamados/board?destination=${destination}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as { tickets: ItTicket[] };
      const now = Date.now();
      setTickets((prev) => {
        // Descarta ids cujo TTL otimista expirou.
        for (const [id, ts] of pending.current) {
          if (now - ts > OPTIMISTIC_TTL) pending.current.delete(id);
        }
        if (pending.current.size === 0) return data.tickets;
        // Preserva a versão local dos ids ainda pendentes.
        const localById = new Map(prev.map((t) => [t.id, t]));
        return data.tickets.map((server) =>
          pending.current.has(server.id) ? localById.get(server.id) ?? server : server,
        );
      });
    } catch {
      // Silencioso: erro transitório de rede não deve quebrar o board.
    } finally {
      inFlight.current = false;
    }
  }, [destination]);

  useEffect(() => {
    timer.current = setInterval(load, BOARD_POLL_INTERVAL_MS);
    const onVisible = () => {
      if (!document.hidden) void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      if (timer.current) clearInterval(timer.current);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  const applyOptimistic = useCallback((id: string, patch: Partial<ItTicket>) => {
    pending.current.set(id, Date.now());
    setTickets((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);

  const setLocal = useCallback(
    (updater: (prev: readonly ItTicket[]) => readonly ItTicket[]) => {
      setTickets((prev) => updater(prev));
    },
    [],
  );

  const refresh = useCallback(() => {
    void load();
  }, [load]);

  return { tickets, applyOptimistic, setLocal, refresh };
}
