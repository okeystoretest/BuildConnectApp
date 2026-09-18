"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { AppNotification } from "@/types/notification";
import {
  dismissAllNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/notifications/actions";

/** Intervalo de sincronização do sino (ms). */
export const NOTIFICATIONS_POLL_MS = 60_000;

interface NotificationContextValue {
  notifications: readonly AppNotification[];
  unreadCount: number;
  markAllRead: () => void;
  markRead: (id: string) => void;
  clearAll: () => void;
  refresh: () => void;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

/**
 * O sino, lido do banco.
 *
 * A lista inicial vem renderizada do servidor (layout.tsx), então o contador
 * já aparece certo na primeira pintura. Depois ela se mantém por polling
 * leve, no mesmo desenho do `PendingEvaluationsProvider`: pausa com a aba
 * oculta e re-sincroniza quando ela volta. O recorte (quem vê o quê) é todo
 * do servidor — aqui só chega o que é deste usuário.
 *
 * Os botões atualizam a tela na hora (otimista) e gravam pela Server Action;
 * o próximo poll confirma. Sem sessão (`initial` nulo, tela de login) nada é
 * buscado.
 */
export function NotificationProvider({
  initial,
  children,
}: {
  initial: readonly AppNotification[] | null;
  children: React.ReactNode;
}) {
  const [items, setItems] = useState<readonly AppNotification[]>(initial ?? []);
  const inFlight = useRef(false);
  const enabled = initial !== null;

  useEffect(() => {
    setItems(initial ?? []);
  }, [initial]);

  const load = useCallback(async () => {
    if (!enabled || inFlight.current) return;
    if (typeof document !== "undefined" && document.hidden) return;
    inFlight.current = true;
    try {
      const res = await fetch("/api/notificacoes", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { items?: AppNotification[] };
      if (Array.isArray(data.items)) setItems(data.items);
    } catch {
      // Silencioso: falha transitória de rede não deve zerar o sino.
    } finally {
      inFlight.current = false;
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(load, NOTIFICATIONS_POLL_MS);
    const onVisible = () => {
      if (!document.hidden) void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, load]);

  const unreadCount = useMemo(() => items.filter((item) => !item.read).length, [items]);

  const markAllRead = useCallback(() => {
    setItems((prev) => prev.map((item) => ({ ...item, read: true })));
    void markAllNotificationsRead();
  }, []);

  const markRead = useCallback((id: string) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, read: true } : item)));
    void markNotificationRead(id);
  }, []);

  const clearAll = useCallback(() => {
    setItems([]);
    void dismissAllNotifications();
  }, []);

  const value = useMemo(
    () => ({ notifications: items, unreadCount, markAllRead, markRead, clearAll, refresh: load }),
    [items, unreadCount, markAllRead, markRead, clearAll, load],
  );

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotifications(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error("useNotifications precisa estar dentro de <NotificationProvider>.");
  return ctx;
}
