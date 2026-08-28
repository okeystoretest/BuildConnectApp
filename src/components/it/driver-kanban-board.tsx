"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRole } from "@/providers/role-provider";
import type { ItTicket, ItTicketStatus } from "@/types/it";
import { IT_STATUS_ORDER, IT_STATUS_LABEL, IT_STATUS_DOT } from "@/lib/it-data";
import { cn } from "@/lib/utils";
import { completeTicketWithProof, hardDeleteTicket } from "@/lib/ticket-actions";
import { useTicketsPoll } from "@/lib/use-tickets-poll";
import { assignTicket, unassignTicket, listAssignableUsers } from "@/lib/tickets/assign-actions";
import { DriverTicketCard } from "./driver-ticket-card";
import { TicketDetailModal } from "./ticket-detail-modal";
import { CompleteTicketModal } from "./complete-ticket-modal";
import type { CompletionData } from "./complete-ticket-modal";
import { AssignTicketModal } from "./assign-ticket-modal";
import { DeleteTicketModal } from "./delete-ticket-modal";
import { TicketHistoryModal } from "./ticket-history-modal";

export interface DriverKanbanBoardProps {
  tickets: readonly ItTicket[];
}

/**
 * Kanban de Motoristas orientado a AÇÕES (não a arrastar).
 *
 * Cada card mostra botões conforme status/papel (ver DriverTicketCard). Este
 * board é a tela operacional do motorista: assumir, iniciar (liga o GPS),
 * concluir. A gestão (tickets.manage) tem os mesmos botões mais "Atribuir
 * para…" e a exclusão definitiva. Sincroniza "quase em tempo real" via
 * polling (~15s). O board de TI (KanbanBoard) segue com drag.
 *
 * Concluído permanece 30 minutos no quadro e depois passa ao Histórico, aberto
 * pelo botão do cabeçalho.
 */
export function DriverKanbanBoard({ tickets: source }: DriverKanbanBoardProps) {
  const { user, can } = useRole();
  const router = useRouter();

  const canManage = can("tickets.manage");
  const canClaim = can("tickets.claim");

  const { tickets, applyOptimistic, setLocal, refresh } = useTicketsPoll("MOTORISTAS", source);

  const [selected, setSelected] = useState<ItTicket | null>(null);
  const [completing, setCompleting] = useState<ItTicket | null>(null);
  const [assigning, setAssigning] = useState<ItTicket | null>(null);
  const [deleting, setDeleting] = useState<ItTicket | null>(null);
  const [drivers, setDrivers] = useState<{ id: string; name: string }[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [, startTransition] = useTransition();

  const byStatus = useMemo(() => {
    const map: Record<ItTicketStatus, ItTicket[]> = {
      PENDENTE: [],
      ATRIBUIDO: [],
      EM_ANDAMENTO: [],
      CONCLUIDO: [],
    };
    for (const t of tickets) map[t.status]?.push(t);
    return map;
  }, [tickets]);

  function handleClaim(ticket: ItTicket) {
    applyOptimistic(ticket.id, {
      status: "ATRIBUIDO",
      assigneeId: user.id,
      assignee: user.name,
    });
    startTransition(async () => {
      const res = await assignTicket({ ticketId: ticket.id });
      if (!res.ok) refresh();
    });
  }

  function handleUnassign(ticket: ItTicket) {
    applyOptimistic(ticket.id, { status: "PENDENTE", assigneeId: undefined, assignee: undefined });
    startTransition(async () => {
      const res = await unassignTicket({ ticketId: ticket.id });
      if (!res.ok) refresh();
    });
  }

  async function handleOpenAssignOther(ticket: ItTicket) {
    setAssigning(ticket);
    if (drivers.length === 0) {
      const list = await listAssignableUsers();
      setDrivers(list);
    }
  }

  function handleAssignOther(driverId: string, driverName: string) {
    if (!assigning) return;
    const ticket = assigning;
    setAssigning(null);
    applyOptimistic(ticket.id, {
      status: "ATRIBUIDO",
      assigneeId: driverId,
      assignee: driverName,
    });
    startTransition(async () => {
      const res = await assignTicket({ ticketId: ticket.id, assigneeId: driverId });
      if (!res.ok) refresh();
    });
  }

  function handleStarted(ticket: ItTicket) {
    // startTrip já marcou startedAt no servidor; refletimos o status local.
    applyOptimistic(ticket.id, { status: "EM_ANDAMENTO" });
  }

  function confirmCompletion(data: CompletionData) {
    if (!completing) return;
    const id = completing.id;
    applyOptimistic(id, {
      status: "CONCLUIDO",
      proofName: data.proof?.name,
      distanceKm: data.distanceKm ?? undefined,
    });
    setCompleting(null);

    if (data.proof) {
      const fd = new FormData();
      fd.set("ticketId", id);
      fd.set("proof", data.proof);
      if (data.distanceKm !== null) fd.set("distanceKm", String(data.distanceKm));
      startTransition(async () => {
        const res = await completeTicketWithProof(fd);
        if (!res.ok) refresh();
      });
    }
  }

  function confirmDelete() {
    if (!deleting) return;
    const id = deleting.id;
    setDeleting(null);
    setLocal((prev) => prev.filter((t) => t.id !== id));
    startTransition(async () => {
      const res = await hardDeleteTicket(id);
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
          Assuma um chamado, inicie a corrida para transmitir sua localização e conclua com o
          comprovante de entrega. O quadro sincroniza automaticamente.
        </p>
        <Button variant="secondary" size="sm" onClick={() => setHistoryOpen(true)}>
          <History className="h-4 w-4" />
          Histórico
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {IT_STATUS_ORDER.map((status) => (
          <section
            key={status}
            aria-label={`Coluna ${IT_STATUS_LABEL[status]}`}
            className="flex min-w-0 flex-1 flex-col rounded-xl border border-border bg-surface-2/40 p-3"
          >
            <header className="mb-3 flex items-center justify-between">
              <span className="flex items-center gap-2 text-xs font-semibold text-foreground">
                <span
                  className={cn("h-2 w-2 rounded-full", IT_STATUS_DOT[status])}
                  aria-hidden
                />
                {IT_STATUS_LABEL[status]}
              </span>
              <span className="text-xs text-muted">{byStatus[status].length}</span>
            </header>

            <div className="scrollbar-slim flex-1 space-y-3 overflow-y-auto pr-0.5 [max-height:calc(100vh-20rem)]">
              {byStatus[status].map((ticket) => (
                <DriverTicketCard
                  key={ticket.id}
                  ticket={ticket}
                  currentUserId={user.id}
                  canManage={canManage}
                  canClaim={canClaim}
                  canDelete={canManage}
                  onOpen={setSelected}
                  onClaim={handleClaim}
                  onAssignOther={handleOpenAssignOther}
                  onUnassign={handleUnassign}
                  onStarted={handleStarted}
                  onComplete={setCompleting}
                  onDelete={setDeleting}
                />
              ))}

              {byStatus[status].length === 0 && (
                <p className="rounded-lg border border-dashed border-border py-8 text-center text-xs text-muted">
                  Nenhum chamado
                </p>
              )}
            </div>
          </section>
        ))}
      </div>

      <TicketDetailModal ticket={selected} onClose={() => setSelected(null)} />

      <CompleteTicketModal
        ticket={completing}
        onClose={() => setCompleting(null)}
        onConfirm={confirmCompletion}
      />

      <AssignTicketModal
        open={assigning !== null}
        people={drivers}
        description={
          assigning ? `${assigning.code} · escolha quem assume a corrida.` : undefined
        }
        onClose={() => setAssigning(null)}
        onSelect={handleAssignOther}
      />

      <DeleteTicketModal
        ticket={deleting}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
      />

      <TicketHistoryModal
        open={historyOpen}
        destination="MOTORISTAS"
        onClose={() => setHistoryOpen(false)}
        onSelect={(ticket) => {
          setHistoryOpen(false);
          setSelected(ticket);
        }}
      />
    </>
  );
}
