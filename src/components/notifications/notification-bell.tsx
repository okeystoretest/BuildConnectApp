"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import * as Icons from "lucide-react";
import { Bell, BellOff, Check, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNotifications } from "@/providers/notification-provider";
import { NOTIFICATION_ICON, NOTIFICATION_TONE } from "@/types/notification";
import type { AppNotification } from "@/types/notification";

function Icon({ name, className }: { name: string; className?: string }) {
  const Cmp = (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[name];
  return Cmp ? <Cmp className={className} /> : null;
}

const TONE_STYLE = {
  info: "bg-info/15 text-info",
  accent: "bg-accent/15 text-accent",
  primary: "bg-primary/15 text-primary",
  neutral: "bg-surface-3 text-muted",
} as const;

export function NotificationBell() {
  const { notifications, unreadCount, markAllRead, markRead, clearAll } = useNotifications();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={`Notificações${unreadCount > 0 ? ` (${unreadCount} não lidas)` : ""}`}
          aria-expanded={open}
          className="focus-ring flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface-2 text-foreground transition-colors hover:bg-surface-3"
        >
          <Bell className="h-4 w-4" />
        </button>

        {unreadCount > 0 && (
          <span className="pointer-events-none absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
            {unreadCount}
          </span>
        )}

        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />

            <div
              role="dialog"
              aria-label="Notificações"
              className={cn(
                "animate-fade-in z-50 overflow-hidden border border-border bg-surface shadow-2xl",
                "fixed inset-x-3 top-[4.5rem] rounded-xl",
                "sm:absolute sm:inset-x-auto sm:right-0 sm:top-[calc(100%+8px)] sm:w-[22rem]",
              )}
            >
              <header className="flex items-center justify-between gap-2 border-b border-border bg-surface-2/60 px-4 py-3">
                <div>
                  <h2 className="text-sm font-semibold text-foreground">Notificações</h2>
                  <p className="text-[11px] text-muted">
                    {unreadCount > 0 ? `${unreadCount} não lidas` : "Tudo em dia"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Fechar notificações"
                  className="focus-ring rounded-md p-1 text-muted transition-colors hover:text-foreground sm:hidden"
                >
                  <X className="h-4 w-4" />
                </button>
              </header>

              <div className="scrollbar-slim max-h-[60vh] overflow-y-auto sm:max-h-[24rem]">
                {notifications.length === 0 ? (
                  <div className="flex flex-col items-center px-6 py-12 text-center">
                    <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-surface-2 text-muted">
                      <BellOff className="h-4 w-4" />
                    </span>
                    <p className="text-sm font-medium text-foreground">Nenhuma notificação</p>
                    <p className="mt-1 text-xs text-muted">
                      Novos chamados e conteúdos aparecem aqui.
                    </p>
                  </div>
                ) : (
                  <ul>
                    {notifications.map((item) => (
                      <NotificationRow
                        key={item.id}
                        item={item}
                        onSelect={() => {
                          markRead(item.id);
                          setOpen(false);
                        }}
                      />
                    ))}
                  </ul>
                )}
              </div>

              {notifications.length > 0 && (
                <footer className="flex items-center gap-2 border-t border-border px-3 py-2.5">
                  <button
                    type="button"
                    onClick={markAllRead}
                    disabled={unreadCount === 0}
                    className="focus-ring flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-surface-2 py-2 text-xs text-foreground transition-colors hover:bg-surface-3 disabled:opacity-40"
                  >
                    <Check className="h-3.5 w-3.5" />
                    Marcar como lidas
                  </button>
                  <button
                    type="button"
                    onClick={clearAll}
                    className="focus-ring flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-danger/15 py-2 text-xs text-danger transition-colors hover:bg-danger/25"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Limpar notificações
                  </button>
                </footer>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}

function NotificationRow({
  item,
  onSelect,
}: {
  item: AppNotification;
  onSelect: () => void;
}) {
  const content = (
    <div
      className={cn(
        "flex gap-3 px-4 py-3 transition-colors hover:bg-surface-2/60",
        !item.read && "bg-primary/[0.04]",
      )}
    >
      <span
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
          TONE_STYLE[NOTIFICATION_TONE[item.kind]],
        )}
      >
        <Icon name={NOTIFICATION_ICON[item.kind]} className="h-4 w-4" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <p className="min-w-0 flex-1 text-sm font-medium leading-snug text-foreground">
            {item.title}
          </p>
          {!item.read && (
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
          )}
        </div>
        <p className="mt-0.5 text-xs leading-relaxed text-muted">{item.body}</p>
        <p className="mt-1 text-[10px] text-muted">{item.createdLabel}</p>
      </div>
    </div>
  );

  return (
    <li className="border-b border-border/60 last:border-0">
      {item.href ? (
        <Link href={item.href} onClick={onSelect} className="focus-ring block">
          {content}
        </Link>
      ) : (
        <button type="button" onClick={onSelect} className="focus-ring block w-full text-left">
          {content}
        </button>
      )}
    </li>
  );
}
