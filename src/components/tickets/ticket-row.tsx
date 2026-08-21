"use client";

import { ChevronRight, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Ticket } from "@/types/content";
import { TICKET_STATUS_LABEL, TICKET_STATUS_TONE } from "@/lib/ticket-status";

export interface TicketRowProps {
  ticket: Ticket;
  onSelect?: (ticket: Ticket) => void;
  trackable?: boolean;
}

export function TicketRow({ ticket, onSelect, trackable = false }: TicketRowProps) {
  return (
    <article
      role={onSelect ? "button" : undefined}
      tabIndex={onSelect ? 0 : undefined}
      onClick={() => onSelect?.(ticket)}
      onKeyDown={(e) => {
        if (!onSelect) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(ticket);
        }
      }}
      className={[
        "flex items-center gap-4 rounded-xl border border-border bg-surface p-4 transition-colors",
        onSelect ? "focus-ring cursor-pointer hover:border-border-strong" : "",
      ].join(" ")}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-[10px] font-semibold uppercase text-accent">
        {ticket.sector.slice(0, 2)}
      </span>

      <div className="min-w-0 flex-1">
        <h3 className="truncate text-sm font-semibold text-foreground">{ticket.title}</h3>
        <p className="mt-0.5 flex items-center gap-2 text-xs text-muted">
          <span>
            {ticket.code} · {ticket.openedLabel}
          </span>
          {trackable && (
            <span className="flex items-center gap-1 text-primary">
              <MapPin className="h-3 w-3" />
              Rastreável
            </span>
          )}
        </p>
      </div>

      <Badge tone={TICKET_STATUS_TONE[ticket.status]} className="shrink-0">
        {TICKET_STATUS_LABEL[ticket.status]}
      </Badge>

      {onSelect && <ChevronRight className="h-4 w-4 shrink-0 text-muted" />}
    </article>
  );
}
