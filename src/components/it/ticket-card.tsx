"use client";

import { ArrowRight, Archive, CalendarDays, Eye, Paperclip, Trash2, UserMinus } from "lucide-react";
import { cn, initials } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { itCategoryTone } from "@/lib/it-data";
import { useArchiveCountdown } from "@/lib/use-archive-countdown";
import type { ItTicket } from "@/types/it";

export interface TicketCardProps {
  ticket: ItTicket;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  dragging: boolean;
  onOpen: (ticket: ItTicket) => void;
  /** Ações rápidas mobile. */
  onAdvance?: (ticket: ItTicket) => void;
  onUnassign?: (ticket: ItTicket) => void;
  nextStatusLabel?: string | null;
  readOnly?: boolean;
  /** Exclusão definitiva — exclusiva do Admin. É a ÚNICA forma de encerrar
   *  um chamado fora do fluxo; o antigo "Cancelar" foi removido por ser
   *  redundante com ela, tanto na interface quanto no código. */
  canDelete?: boolean;
  onDelete?: (ticket: ItTicket) => void;
}

export function TicketCard({
  ticket,
  onDragStart,
  onDragEnd,
  dragging,
  onOpen,
  onAdvance,
  onUnassign,
  nextStatusLabel,
  readOnly = false,
  canDelete = false,
  onDelete,
}: TicketCardProps) {
  const attachmentCount = ticket.attachments?.length ?? 0;
  // Concluído: quanto falta para o card sair do quadro e ir para o histórico.
  const countdown = useArchiveCountdown(
    ticket.status === "CONCLUIDO" ? ticket.finishedAt : undefined,
  );

  return (
    <article
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", ticket.id);
        onDragStart(ticket.id);
      }}
      onDragEnd={onDragEnd}
      className={cn(
        "cursor-grab rounded-xl border border-border bg-surface p-3.5 transition-all active:cursor-grabbing",
        dragging ? "opacity-40" : "hover:border-border-strong",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-mono text-[11px] text-muted">{ticket.code}</span>
        <div className="flex shrink-0 items-center gap-1.5">
          <Badge tone={itCategoryTone(ticket.category)} className="text-[10px]">
            {ticket.category}
          </Badge>
          {canDelete && onDelete && (
            <button
              type="button"
              onClick={() => onDelete(ticket)}
              aria-label={`Excluir chamado ${ticket.code}`}
              className="focus-ring flex h-6 w-6 items-center justify-center rounded-md text-muted transition-colors hover:bg-danger/10 hover:text-danger"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <h3 className="mt-2 text-sm font-semibold leading-snug text-foreground">{ticket.title}</h3>

      <div className="mt-3 flex items-center gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/20 text-[9px] font-semibold text-accent">
          {initials(ticket.requesterName)}
        </span>
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-foreground">{ticket.requesterName}</p>
          <p className="truncate text-[10px] text-muted">
            {ticket.requesterUnit} · {ticket.requesterSector}
          </p>
        </div>
      </div>

      {ticket.assignee && (
        <p className="mt-2 truncate text-[11px] text-muted">
          Responsável: <span className="text-foreground">{ticket.assignee}</span>
        </p>
      )}

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-2.5">
        <span className="flex items-center gap-1.5 text-[10px] text-muted">
          <CalendarDays className="h-3 w-3" />
          {ticket.openedLabel} · {ticket.timeLabel}
          {attachmentCount > 0 && (
            <span className="flex items-center gap-0.5 text-muted">
              <Paperclip className="h-3 w-3" />
              {attachmentCount}
            </span>
          )}
        </span>
        <button
          type="button"
          onClick={() => onOpen(ticket)}
          className="focus-ring flex items-center gap-1 rounded-md bg-surface-2 px-2 py-1 text-[10px] text-muted transition-colors hover:text-foreground"
        >
          <Eye className="h-3 w-3" />
          Detalhes
        </button>
      </div>

      {/* Janela de 30 minutos do concluído: o card avisa que vai sair. */}
      {countdown && (
        <p className="mt-2 flex items-center gap-1.5 rounded-lg bg-surface-2 px-2 py-1.5 text-[10px] text-muted">
          <Archive className="h-3 w-3 shrink-0" />
          {countdown} · depois fica no Histórico
        </p>
      )}

      {/* Ações rápidas — exclusivas de telas pequenas, onde arrastar é impraticável. */}
      {!readOnly && (onAdvance || onUnassign) && (
        <div className="mt-2 flex gap-2 border-t border-border pt-2.5 sm:hidden">
          {onUnassign && ticket.status !== "PENDENTE" && (
            <button
              type="button"
              onClick={() => onUnassign(ticket)}
              className="focus-ring flex flex-1 items-center justify-center gap-1 rounded-lg bg-surface-2 py-2 text-[11px] text-muted transition-colors hover:text-foreground"
            >
              <UserMinus className="h-3 w-3" />
              Desatribuir
            </button>
          )}
          {onAdvance && nextStatusLabel && (
            <button
              type="button"
              onClick={() => onAdvance(ticket)}
              className="focus-ring flex flex-1 items-center justify-center gap-1 rounded-lg bg-primary/15 py-2 text-[11px] font-medium text-primary transition-colors hover:bg-primary/25"
            >
              {nextStatusLabel}
              <ArrowRight className="h-3 w-3" />
            </button>
          )}
        </div>
      )}
    </article>
  );
}
