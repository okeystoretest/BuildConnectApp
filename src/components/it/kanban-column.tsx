"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { ItTicket, ItTicketStatus } from "@/types/it";
import { IT_STATUS_DOT, IT_STATUS_LABEL } from "@/lib/it-data";
import { TicketCard } from "./ticket-card";

export interface KanbanColumnProps {
  status: ItTicketStatus;
  tickets: readonly ItTicket[];
  draggingId: string | null;
  readOnly?: boolean;
  nextStatus?: ItTicketStatus | null;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onDrop: (status: ItTicketStatus) => void;
  onOpen: (ticket: ItTicket) => void;
  onAdvance?: (ticket: ItTicket) => void;
  onUnassign?: (ticket: ItTicket) => void;
  /** Exclusão definitiva (Admin). */
  canDelete?: boolean;
  onDelete?: (ticket: ItTicket) => void;
  /** Cancelamento (gestão). */
  canManageCancel?: boolean;
  onCancel?: (ticket: ItTicket) => void;
}

export function KanbanColumn({
  status,
  tickets,
  draggingId,
  readOnly = false,
  nextStatus,
  onDragStart,
  onDragEnd,
  onDrop,
  onOpen,
  onAdvance,
  onUnassign,
  canDelete = false,
  onDelete,
  canManageCancel = false,
  onCancel,
}: KanbanColumnProps) {
  const [over, setOver] = useState(false);

  return (
    <section
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        onDrop(status);
      }}
      aria-label={`Coluna ${IT_STATUS_LABEL[status]}`}
      className={cn(
        "flex min-w-0 flex-1 flex-col rounded-xl border bg-surface-2/40 p-3 transition-colors",
        over ? "border-primary/50 bg-primary/[0.04]" : "border-border",
      )}
    >
      <header className="mb-3 flex items-center justify-between">
        <span className="flex items-center gap-2 text-xs font-semibold text-foreground">
          <span className={cn("h-2 w-2 rounded-full", IT_STATUS_DOT[status])} aria-hidden />
          {IT_STATUS_LABEL[status]}
        </span>
        <span className="text-xs text-muted">{tickets.length}</span>
      </header>

      <div className="scrollbar-slim flex-1 space-y-3 overflow-y-auto pr-0.5 [max-height:calc(100vh-20rem)]">
        {tickets.map((ticket) => (
          <TicketCard
            key={ticket.id}
            ticket={ticket}
            dragging={draggingId === ticket.id}
            readOnly={readOnly}
            nextStatusLabel={nextStatus ? IT_STATUS_LABEL[nextStatus] : null}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onOpen={onOpen}
            onAdvance={onAdvance}
            onUnassign={onUnassign}
            canDelete={canDelete}
            onDelete={onDelete}
            canManageCancel={canManageCancel}
            onCancel={onCancel}
          />
        ))}

        {tickets.length === 0 && (
          <p className="rounded-lg border border-dashed border-border py-8 text-center text-xs text-muted">
            Solte um card aqui
          </p>
        )}
      </div>
    </section>
  );
}
