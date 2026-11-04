"use client";

import { useState } from "react";
import { History, Plus, Ticket as TicketIcon } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { MyTicketsKanban } from "@/components/tickets/my-tickets-kanban";
import { MyTicketDetailModal } from "@/components/tickets/my-ticket-detail-modal";
import { MyTicketHistoryModal } from "@/components/tickets/my-ticket-history-modal";
import { useTicketModal } from "@/providers/ticket-modal-provider";
import type { Ticket } from "@/types/content";

export interface TicketsViewProps {
  tickets: readonly Ticket[];
}

export function TicketsView({ tickets }: TicketsViewProps) {
  const { openModal } = useTicketModal();
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  return (
    <AppShell eyebrow="Menu" title="Meus Chamados">
      <PageHeader
        title="Meus Chamados"
        description="Acompanhe o andamento das suas solicitações."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={() => setHistoryOpen(true)}>
              <History className="h-4 w-4" />
              Histórico
            </Button>
            <Button onClick={openModal}>
              <Plus className="h-4 w-4" />
              Abrir Chamado
            </Button>
          </div>
        }
      />

      <div className="mt-6">
        {tickets.length > 0 ? (
          <MyTicketsKanban tickets={tickets} onSelect={setSelected} />
        ) : (
          <EmptyState
            icon={<TicketIcon className="h-5 w-5" />}
            title="Nenhum chamado aberto"
            description="Quando você abrir uma solicitação, ela aparece aqui com o status atualizado."
            action={
              <Button onClick={openModal}>
                <Plus className="h-4 w-4" />
                Abrir Chamado
              </Button>
            }
          />
        )}
      </div>

      <MyTicketDetailModal ticket={selected} onClose={() => setSelected(null)} />
      <MyTicketHistoryModal
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onSelect={(ticket) => {
          setSelected(ticket);
          setHistoryOpen(false);
        }}
      />
    </AppShell>
  );
}
