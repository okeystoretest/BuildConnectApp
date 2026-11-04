"use client";

import { useEffect, useState } from "react";
import { Archive, Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { listMyTicketHistory } from "@/lib/tickets/history-actions";
import type { MyTicketHistoryItem } from "@/lib/tickets/timeline";

export interface MyTicketHistoryModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Histórico do solicitante: seus chamados concluídos, cada um com a linha do
 * tempo (abertura, atribuição, andamento, encerramento) com data e hora.
 *
 * A lista é buscada na ABERTURA do modal, não junto com a página: é consulta
 * ocasional e cresce com o tempo — carregá-la sempre pesaria em toda visita.
 */
export function MyTicketHistoryModal({ open, onClose }: MyTicketHistoryModalProps) {
  const [tickets, setTickets] = useState<MyTicketHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    setLoading(true);
    setError(null);
    listMyTicketHistory()
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
  }, [open]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Histórico de chamados"
      description="Seus chamados concluídos, com o andamento completo de cada um."
      className="max-w-3xl"
      footer={
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-muted">
            {loading ? "Carregando…" : `${tickets.length} concluído(s)`}
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
            title="Nenhum chamado concluído"
            description="Quando uma das suas solicitações for encerrada, o histórico dela aparece aqui."
          />
        )}

        {!loading && !error && tickets.length > 0 && (
          <ul className="space-y-3">
            {tickets.map((ticket) => (
              <li
                key={ticket.id}
                className="rounded-xl border border-border bg-surface p-3.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-[11px] text-muted">{ticket.code}</span>
                  <span className="text-[11px] text-muted">
                    {ticket.sector}
                    {ticket.category ? ` · ${ticket.category}` : ""}
                  </span>
                </div>

                <p className="mt-1.5 text-sm font-semibold leading-snug text-foreground">
                  {ticket.title}
                </p>

                <ol className="mt-3 space-y-2 border-l border-border pl-3.5">
                  {ticket.timeline.map((entry) => (
                    <li key={entry.key} className="relative text-[12px] leading-snug">
                      <span
                        aria-hidden
                        className="absolute -left-[18px] top-1.5 h-1.5 w-1.5 rounded-full bg-border-strong"
                      />
                      <span className="text-foreground">{entry.label}</span>
                      {entry.by && <span className="text-muted"> · por {entry.by}</span>}
                      <span className="block text-[11px] text-muted">{entry.atLabel}</span>
                    </li>
                  ))}
                </ol>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
