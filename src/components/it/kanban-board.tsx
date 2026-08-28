"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRole } from "@/providers/role-provider";
import { filterVisibleTickets } from "@/lib/ticket-visibility";
import type { ItTicket, ItTicketStatus } from "@/types/it";
import { IT_STATUS_ORDER } from "@/lib/it-data";
import { updateTicketStatus, hardDeleteTicket } from "@/lib/ticket-actions";
import {
  assignTicket,
  listAssignableUsers,
  unassignTicket,
} from "@/lib/tickets/assign-actions";
import { useTicketsPoll } from "@/lib/use-tickets-poll";
import { KanbanColumn } from "./kanban-column";
import { TicketDetailModal } from "./ticket-detail-modal";
import { ResolutionModal } from "./resolution-modal";
import { DeleteTicketModal } from "./delete-ticket-modal";
import { AssignTicketModal } from "./assign-ticket-modal";
import { TicketHistoryModal } from "./ticket-history-modal";

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
 *
 * Regras do quadro:
 *  - Mover para ATRIBUÍDO exige um responsável, definido na hora e gravado
 *    junto com o status — não é mais preciso passar por "Em andamento" para
 *    o chamado ganhar dono.
 *  - Concluir exige a descrição técnica da solução.
 *  - Concluído fica 30 minutos no quadro e depois vai para o Histórico.
 *  - Excluir (Admin) é a única forma de tirar um chamado do fluxo.
 */
export function KanbanBoard({ tickets: source, readOnly = false }: KanbanBoardProps) {
  const { user, role, can } = useRole();
  const router = useRouter();

  const { tickets, applyOptimistic, setLocal, refresh } = useTicketsPoll("TI", source);
  const canDelete = can("tickets.manage");
  const canAssignOthers = can("tickets.manage");
  const canClaim = can("tickets.claim");

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<ItTicket | null>(null);
  const [completing, setCompleting] = useState<ItTicket | null>(null);
  const [deleting, setDeleting] = useState<ItTicket | null>(null);
  const [assigning, setAssigning] = useState<ItTicket | null>(null);
  const [people, setPeople] = useState<{ id: string; name: string }[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);

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

  /** Abre a escolha do responsável, carregando a lista uma única vez. */
  async function openAssign(ticket: ItTicket) {
    setAssigning(ticket);
    if (canAssignOthers && people.length === 0) {
      setPeople(await listAssignableUsers());
    }
  }

  function moveTo(ticket: ItTicket, status: ItTicketStatus) {
    if (readOnly) return;
    // Conclusão de TI exige a descrição técnica da solução.
    if (status === "CONCLUIDO") {
      setCompleting(ticket);
      return;
    }
    // Atribuir sem dono: pede o responsável antes de mover o card.
    if (status === "ATRIBUIDO" && !ticket.assigneeId) {
      void openAssign(ticket);
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

  /**
   * Desatribuir: volta para Pendente E limpa o responsável.
   *
   * Passa por `unassignTicket` justamente por isso — a atualização de status
   * sozinha devolveria o card para Pendente mantendo o responsável gravado, o
   * que deixaria "Responsável: fulano" num chamado que ninguém assumiu.
   */
  function unassign(ticket: ItTicket) {
    applyOptimistic(ticket.id, {
      status: "PENDENTE",
      assigneeId: undefined,
      assignee: undefined,
    });
    void unassignTicket({ ticketId: ticket.id }).then((res) => {
      if (!res.ok) refresh();
    });
  }

  /** Responsável escolhido: status e atribuição vão juntos ao servidor. */
  function confirmAssign(userId: string, userName: string) {
    if (!assigning) return;
    const id = assigning.id;
    setAssigning(null);
    applyOptimistic(id, {
      status: "ATRIBUIDO",
      assigneeId: userId,
      assignee: userName,
    });
    void assignTicket({ ticketId: id, assigneeId: userId }).then((res) => {
      if (!res.ok) refresh();
    });
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

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          {readOnly
            ? "Acompanhe o status dos chamados do setor."
            : "Arraste os cards entre as colunas para atualizar o status. O quadro sincroniza automaticamente."}
        </p>
        <Button variant="secondary" size="sm" onClick={() => setHistoryOpen(true)}>
          <History className="h-4 w-4" />
          Histórico
        </Button>
      </div>

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
            onUnassign={unassign}
            canDelete={canDelete && !readOnly}
            onDelete={setDeleting}
          />
        ))}
      </div>

      <TicketDetailModal ticket={selected} onClose={() => setSelected(null)} />

      <AssignTicketModal
        open={assigning !== null}
        people={people}
        self={canClaim ? { id: user.id, name: user.name } : null}
        description={
          assigning
            ? `${assigning.code} · defina quem assume o chamado ao movê-lo para Atribuído.`
            : undefined
        }
        onClose={() => setAssigning(null)}
        onSelect={confirmAssign}
      />

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

      <TicketHistoryModal
        open={historyOpen}
        destination="TI"
        onClose={() => setHistoryOpen(false)}
        onSelect={(ticket) => {
          setHistoryOpen(false);
          setSelected(ticket);
        }}
      />
    </>
  );
}
