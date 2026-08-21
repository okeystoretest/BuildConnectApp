"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { AppNotification } from "@/types/notification";
import { INITIAL_NOTIFICATIONS } from "@/lib/notifications-data";
import { useRole } from "./role-provider";

interface NotificationContextValue {
  notifications: readonly AppNotification[];
  unreadCount: number;
  markAllRead: () => void;
  markRead: (id: string) => void;
  clearAll: () => void;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { user, role } = useRole();
  const [items, setItems] = useState<readonly AppNotification[]>(INITIAL_NOTIFICATIONS);

  /**
   * Admin enxerga tudo. Os demais recebem apenas o que é destinado ao
   * próprio setor/subsetor, ou o que é geral ("*").
   */
  const visible = useMemo(() => {
    if (role === "ADMIN") return items;
    const mine = [user.sector, user.subsector].filter(Boolean) as string[];
    return items.filter(
      (item) =>
        item.audience.includes("*") ||
        item.audience.some((target) => mine.includes(target)),
    );
  }, [items, role, user.sector, user.subsector]);

  const unreadCount = useMemo(() => visible.filter((item) => !item.read).length, [visible]);

  const markAllRead = useCallback(() => {
    setItems((prev) => prev.map((item) => ({ ...item, read: true })));
  }, []);

  const markRead = useCallback((id: string) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, read: true } : item)));
  }, []);

  const clearAll = useCallback(() => setItems([]), []);

  const value = useMemo(
    () => ({ notifications: visible, unreadCount, markAllRead, markRead, clearAll }),
    [visible, unreadCount, markAllRead, markRead, clearAll],
  );

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotifications(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error("useNotifications precisa estar dentro de <NotificationProvider>.");
  return ctx;
}
