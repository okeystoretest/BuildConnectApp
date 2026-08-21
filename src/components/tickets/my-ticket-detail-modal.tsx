"use client";

import { X } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { TripTrackingPanel } from "@/components/tracking/trip-tracking-panel";
import { TICKET_STATUS_LABEL, TICKET_STATUS_TONE } from "@/lib/ticket-status";
import type { Ticket } from "@/types/content";

export interface MyTicketDetailModalProps {
  ticket: Ticket | null;
  onClose: () => void;
}

/** Setores cujos chamados têm acompanhamento por mapa. */
const TRACKED_SECTORS = ["Motoristas"];

export function MyTicketDetailModal({ ticket, onClose }: MyTicketDetailModalProps) {
  if (!ticket) return null;

  const isDriverTicket = TRACKED_SECTORS.includes(ticket.sector);
  // Habilita o polling para qualquer chamado de motorista. O painel trata
  // sozinho o caso "corrida não iniciada" (404) exibindo estado neutro, e
  // segue mostrando o rastro após a conclusão.
  const trackable = isDriverTicket;

  return (
    <Modal open onClose={onClose} className="max-w-2xl">
      <div className="scrollbar-slim max-h-[85vh] overflow-y-auto p-6">
        <header className="mb-5 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-lg font-bold leading-snug tracking-tight text-foreground">
              {ticket.title}
            </h2>
            <p className="mt-0.5 text-xs text-muted">
              {ticket.code} · {ticket.openedLabel} · {ticket.sector}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="focus-ring flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-2 text-muted transition-colors hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <Badge tone={TICKET_STATUS_TONE[ticket.status]}>
          {TICKET_STATUS_LABEL[ticket.status]}
        </Badge>

        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          {ticket.category && (
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-muted">Categoria</dt>
              <dd className="mt-0.5 text-sm text-foreground">{ticket.category}</dd>
            </div>
          )}
          <div>
            <dt className="text-[11px] uppercase tracking-wide text-muted">Setor</dt>
            <dd className="mt-0.5 text-sm text-foreground">{ticket.sector}</dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-wide text-muted">Solicitado por</dt>
            <dd className="mt-0.5 text-sm text-foreground">{ticket.requestedBy ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-wide text-muted">Responsável</dt>
            <dd className="mt-0.5 text-sm text-foreground">
              {ticket.assignee ?? "Aguardando atribuição"}
            </dd>
          </div>
        </dl>

        {isDriverTicket && (
          <section className="mt-5">
            <h3 className="mb-2.5 text-sm font-semibold text-foreground">
              Acompanhamento em tempo real
            </h3>
            <TripTrackingPanel ticketId={ticket.id} enabled={trackable} />
          </section>
        )}
      </div>
    </Modal>
  );
}
