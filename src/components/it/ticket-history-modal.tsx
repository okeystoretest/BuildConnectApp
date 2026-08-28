"use client";

import { useEffect, useState } from "react";
import { Archive, Clock, Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { itCategoryTone } from "@/lib/it-data";
import { listTicketHistory } from "@/lib/tickets/history-actions";
import type { ItTicket } from "@/types/it";

export interface TicketHistoryModalProps {
  open: boolean;
  destination: "TI" | "MOTORISTAS";
  onClose: () => void;
  /** Abre o detalhe do chamado escolhido (o histórico se fecha). */
  onSelect: (ticket: ItTicket) => void;
}

/**
 * Histórico do quadro: os chamados concluídos que já cumpriram os 30 minutos
 * de permanência e saíram das colunas.
 *
 * A lista é buscada na ABERTURA do modal, não junto com a página: é consulta
 * de consulta ocasional e cresce sem limite com o tempo — carregá-la sempre
 * pesaria em toda visita ao setor.
 */
export function TicketHistoryModal({
  open,
  destination,
  onClose,
  onSelect,
}: TicketHistoryModalProps) {
  const [tickets, setTickets] = useState<ItTicket[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    setLoading(true);
    setError(null);
    listTicketHistory(destination)
      .then((res) => {
        if (cancelled) return;
        if (res.ok) setTickets(res.tickets);
        else setError(res.error ?? "Não foi possível carregar o histórico.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, destination]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Histórico de chamados"
      description="Chamados concluídos e arquivados — 30 minutos após a conclusão eles saem do quadro e passam a ser lidos aqui."
      className="max-w-3xl"
      footer={
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-muted">
            {loading ? "Carregando…" : `${tickets.length} arquivado(s)`}
          </span>
          <Button variant="secondary" onClick={onClose}>
            Fechar
          </Button>
        </div>
      }
    >
      <div className="scrollbar-slim max-h-[60vh] overflow-y-auto p-6">
        {loading && (
          <p className="flex items-center justify-center gap-2 py-10 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando histórico…
          </p>
        )}

        {!loading && error && (
          <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
            {error}
          </p>
        )}

        {!loading && !error && tickets.length === 0 && (
          <EmptyState
            icon={<Archive className="h-5 w-5" />}
            title="Nada arquivado ainda"
            description="Os chamados concluídos aparecem aqui 30 minutos depois do encerramento."
          />
        )}

        {!loading && !error && tickets.length > 0 && (
          <ul className="space-y-2">
            {tickets.map((ticket) => (
              <li key={ticket.id}>
                <button
                  type="button"
                  onClick={() => onSelect(ticket)}
                  className="focus-ring w-full rounded-xl border border-border bg-surface p-3.5 text-left transition-colors hover:border-border-strong hover:bg-surface-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-[11px] text-muted">{ticket.code}</span>
                    <Badge tone={itCategoryTone(ticket.category)} className="text-[10px]">
                      {ticket.category}
                    </Badge>
                  </div>

                  <p className="mt-1.5 text-sm font-semibold leading-snug text-foreground">
                    {ticket.title}
                  </p>

                  <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
                    <span>
                      {ticket.requesterName} · {ticket.requesterUnit}
                    </span>
                    <span>Responsável: {ticket.assignee ?? "—"}</span>
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Aberto em {ticket.openedLabel}
                      {ticket.durationLabel ? ` · ${ticket.durationLabel}` : ""}
                    </span>
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
