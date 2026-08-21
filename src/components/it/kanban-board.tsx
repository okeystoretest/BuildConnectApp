"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useRole } from "@/providers/role-provider";
import { filterVisibleTickets } from "@/lib/ticket-visibility";
import type { ItTicket, ItTicketStatus } from "@/types/it";
import { IT_STATUS_ORDER } from "@/lib/it-data";
import { updateTicketStatus, hardDeleteTicket, cancelTicket } from "@/lib/ticket-actions";
import { useTicketsPoll } from "@/lib/use-tickets-poll";
import { KanbanColumn } from "./kanban-column";
import { TicketDetailModal } from "./ticket-detail-modal";
import { ResolutionModal } from "./resolution-modal";
import { DeleteTicketModal } from "./delete-ticket-modal";
import { CancelTicketModal } from "./cancel-ticket-modal";

export interface KanbanBoardProps {
  tickets: readonly ItTicket[];
  readOnly?: boolean;
}

/** Etapa seguinte no fluxo, para a ação rápida mobile. */
const NEXT_STATUS: Record<ItTicketStatus, ItTicketStatus | null> = {
  PENDENTE: "ATRIBUIDO",
  ATRIBUIDO: "EM_ANDAMENTO",
  EM_ANDAMENTO: "CONCLUIDO",
  CONCLUIDO: null,
};

/**
 * Kanban de TI (com drag). Sincroniza "quase em tempo real" via polling:
 * novos chamados e movimentações de outros usuários aparecem em até ~15s.
 * Ao concluir, exige a descrição técnica da solução. O Admin pode excluir
 * qualquer chamado definitivamente.
 */
export function KanbanBoard({ tickets: source, readOnly = false }: KanbanBoardProps) {
  const { user, role, can } = useRole();
  const router = useRouter();

  const { tickets, applyOptimistic, setLocal, refresh } = useTicketsPoll("TI", source);
  const canDelete = can("tickets.manage");

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<ItTicket | null>(null);
  const [completing, setCompleting] = useState<ItTicket | null>(null);
  const [deleting, setDeleting] = useState<ItTicket | null>(null);
  const [cancelling, setCancelling] = useState<ItTicket | null>(null);

  // Camada visual de privacidade — reforçada no backend.
  const visibleTickets = useMemo(
    () => filterVisibleTickets(tickets, { name: user.name, role }),
    [tickets, user.name, role],
  );

  async function persistStatus(id: string, status: ItTicketStatus, resolutionNote?: string) {
    const res = await updateTicketStatus({ ticketId: id, status, resolutionNote });
    if (!res.ok) refresh();
  }

  function applyStatus(id: string, status: ItTicketStatus) {
    const startedTracking =
      status === "EM_ANDAMENTO"
        ? { startedAt: new Date().toISOString() }
        : {};
    applyOptimistic(id, { status, ...startedTracking });
    void persistStatus(id, status);
  }

  function moveTo(ticket: ItTicket, status: ItTicketStatus) {
    if (readOnly) return;
    // Conclusão de TI exige a descrição técnica da solução.
    if (status === "CONCLUIDO") {
      setCompleting(ticket);
      return;
    }
    applyStatus(ticket.id, status);
  }

  function handleDrop(status: ItTicketStatus) {
    if (readOnly || !draggingId) return;
    const ticket = tickets.find((t) => t.id === draggingId);
    setDraggingId(null);
    if (ticket) moveTo(ticket, status);
  }

  function confirmCompletion(note: string) {
    if (!completing) return;
    const id = completing.id;
    applyOptimistic(id, { status: "CONCLUIDO", resolutionNote: note });
    setCompleting(null);
    void persistStatus(id, "CONCLUIDO", note);
  }

  function confirmDelete() {
    if (!deleting) return;
    const id = deleting.id;
    setDeleting(null);
    setLocal((prev) => prev.filter((t) => t.id !== id));
    void hardDeleteTicket(id).then((res) => {
      if (!res.ok) {
        refresh();
        router.refresh();
      }
    });
  }

  function confirmCancel(reason: string) {
    if (!cancelling) return;
    const id = cancelling.id;
    setCancelling(null);
    // Cancelado sai das colunas ativas — removemos localmente.
    setLocal((prev) => prev.filter((t) => t.id !== id));
    void cancelTicket({ ticketId: id, reason }).then((res) => {
      if (!res.ok) {
        refresh();
        router.refresh();
      }
    });
  }

  return (
    <>
      <p className="mb-4 text-sm text-muted">
        {readOnly
          ? "Acompanhe o status dos chamados do setor."
          : "Arraste os cards entre as colunas para atualizar o status. O quadro sincroniza automaticamente."}
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {IT_STATUS_ORDER.map((status) => (
          <KanbanColumn
            key={status}
            status={status}
            tickets={visibleTickets.filter((ticket) => ticket.status === status)}
            draggingId={draggingId}
            readOnly={readOnly}
            nextStatus={NEXT_STATUS[status]}
            onDragStart={readOnly ? () => {} : setDraggingId}
            onDragEnd={() => setDraggingId(null)}
            onDrop={handleDrop}
            onOpen={setSelected}
            onAdvance={(ticket) => {
              const next = NEXT_STATUS[ticket.status];
              if (next) moveTo(ticket, next);
            }}
            onUnassign={(ticket) => applyStatus(ticket.id, "PENDENTE")}
            canDelete={canDelete && !readOnly}
            onDelete={setDeleting}
            canManageCancel={canDelete && !readOnly}
            onCancel={setCancelling}
          />
        ))}
      </div>

      <TicketDetailModal ticket={selected} onClose={() => setSelected(null)} />

      <ResolutionModal
        ticket={completing}
        onClose={() => setCompleting(null)}
        onConfirm={confirmCompletion}
      />

      <DeleteTicketModal
        ticket={deleting}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
      />

      <CancelTicketModal
        ticket={cancelling}
        onClose={() => setCancelling(null)}
        onConfirm={confirmCancel}
      />
    </>
  );
}
