"use client";

import { ChevronRight, UserCheck, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { Ticket, TicketStatus } from "@/types/content";

const COLUMNS: readonly { status: TicketStatus; label: string; dot: string }[] = [
  { status: "ABERTO", label: "Aberto", dot: "bg-warning" },
  { status: "EM_ANDAMENTO", label: "Em Andamento", dot: "bg-accent" },
  { status: "RESOLVIDO", label: "Resolvido", dot: "bg-primary" },
];

export interface MyTicketsKanbanProps {
  tickets: readonly Ticket[];
  onSelect: (ticket: Ticket) => void;
}

/**
 * Quadro somente-leitura: acompanha o andamento dos próprios chamados.
 * O usuário não movimenta cards — o status é atualizado pela equipe
 * responsável.
 */
export function MyTicketsKanban({ tickets, onSelect }: MyTicketsKanbanProps) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {COLUMNS.map((column) => {
        const columnTickets = tickets.filter((ticket) => ticket.status === column.status);
        return (
          <section
            key={column.status}
            className="flex flex-col rounded-xl border border-border bg-surface-2/40 p-3"
            aria-label={`Coluna ${column.label}`}
          >
            <header className="mb-3 flex items-center justify-between">
              <span className="flex items-center gap-2 text-xs font-semibold text-foreground">
                <span className={cn("h-2 w-2 rounded-full", column.dot)} aria-hidden />
                {column.label}
              </span>
              <span className="text-xs text-muted">{columnTickets.length}</span>
            </header>

            <div className="scrollbar-slim flex-1 space-y-3 overflow-y-auto [max-height:calc(100vh-18rem)]">
              {columnTickets.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border py-8 text-center text-xs text-muted">
                  Nenhum chamado
                </p>
              ) : (
                columnTickets.map((ticket) => (
                  <MyTicketCard key={ticket.id} ticket={ticket} onSelect={onSelect} />
                ))
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function MyTicketCard({
  ticket,
  onSelect,
}: {
  ticket: Ticket;
  onSelect: (ticket: Ticket) => void;
}) {
  return (
    <article
      role="button"
      tabIndex={0}
      onClick={() => onSelect(ticket)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(ticket);
        }
      }}
      className="focus-ring cursor-pointer rounded-xl border border-border bg-surface p-3.5 transition-colors hover:border-border-strong"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-mono text-[11px] text-muted">{ticket.code}</span>
        <Badge tone="neutral" className="shrink-0 text-[10px]">
          {ticket.sector}
        </Badge>
      </div>

      <h3 className="mt-2 text-sm font-semibold leading-snug text-foreground">{ticket.title}</h3>

      <div className="mt-3 space-y-1.5 border-t border-border pt-2.5">
        {ticket.requestedBy && (
          <p className="flex items-center gap-1.5 text-[11px] text-muted">
            <UserPlus className="h-3 w-3 shrink-0" />
            Solicitado por <span className="text-foreground">{ticket.requestedBy}</span>
          </p>
        )}
        <p className="flex items-center gap-1.5 text-[11px] text-muted">
          <UserCheck className="h-3 w-3 shrink-0" />
          {ticket.assignee ? (
            <>
              Responsável <span className="text-foreground">{ticket.assignee}</span>
            </>
          ) : (
            "Aguardando atribuição"
          )}
        </p>
      </div>

      <div className="mt-2 flex items-center justify-end">
        <span className="flex items-center gap-1 text-[10px] text-muted">
          Detalhes
          <ChevronRight className="h-3 w-3" />
        </span>
      </div>
    </article>
  );
}
