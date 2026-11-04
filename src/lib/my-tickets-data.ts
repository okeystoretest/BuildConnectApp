import { prisma } from "@/lib/db/prisma";
import { dayMonthBR, daysAgoBR } from "@/lib/brasilia";
import type { Ticket, TicketStatus } from "@/types/content";
import { archiveCutoff } from "@/lib/archive-window";
import { needsReconcile } from "@/lib/flow/mirror";
import { reconcileTicket } from "@/lib/flow/sync";
import {
  buildTicketTimeline,
  mirrorTimelineEvents,
  type MyTicketHistoryItem,
} from "@/lib/tickets/timeline";

/**
 * Chamados do próprio usuário para a tela "Meus Chamados".
 *
 * A UI usa o tipo Ticket de @/types/content, cujo status tem 3 estados
 * (ABERTO / EM_ANDAMENTO / RESOLVIDO), correspondentes às 3 colunas do
 * quadro. O banco tem 5 estados — o mapa abaixo condensa para os 3 da UI.
 * CANCELADO não entra no quadro (fica fora das colunas).
 */

const STATUS_MAP: Record<string, TicketStatus | null> = {
  PENDENTE: "ABERTO",
  ATRIBUIDO: "ABERTO",
  EM_ANDAMENTO: "EM_ANDAMENTO",
  CONCLUIDO: "RESOLVIDO",
  CANCELADO: null,
};

const DESTINATION_LABEL: Record<string, string> = {
  TI: "TI",
  MOTORISTAS: "Motoristas",
};

/** Rótulo relativo de abertura (hoje / ontem / dd/mm), no calendário de Brasília. */
function openedLabel(date: Date): string {
  const diffDays = daysAgoBR(date);
  if (diffDays <= 0) return "aberto hoje";
  if (diffDays === 1) return "aberto ontem";
  return `aberto ${dayMonthBR(date)}`;
}

/**
 * Chamados CONCLUÍDOS do próprio usuário, com a linha do tempo de cada um —
 * a lista do botão "Histórico".
 *
 * Inclui os que ainda estão no quadro (dentro da janela de 30 min): o
 * histórico do solicitante é "tudo que já concluí", não "o que saiu do quadro".
 * CANCELADO fica fora, como no quadro.
 *
 * Consulta sob demanda (abertura do modal), não na carga da página.
 */
export async function getMyTicketHistory(userId: string): Promise<MyTicketHistoryItem[]> {
  const rows = await prisma.ticket.findMany({
    where: { requesterId: userId, status: "CONCLUIDO" },
    orderBy: [{ finishedAt: "desc" }, { createdAt: "desc" }],
    // shortcut: 100 mais recentes sem paginação, como o histórico do quadro de
    // TI; paginar quando alguém chegar perto disso.
    take: 100,
    include: {
      requester: { select: { fullName: true } },
      assignee: { select: { fullName: true } },
      events: { orderBy: { occurredAt: "asc" } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    title: row.title,
    sector: DESTINATION_LABEL[row.destination] ?? row.destination,
    category: row.category ?? undefined,
    timeline: buildTicketTimeline({
      createdAt: row.createdAt,
      requesterName: row.requester.fullName,
      events:
        row.destination === "MOTORISTAS"
          ? mirrorTimelineEvents({ ...row, assigneeName: row.assignee?.fullName ?? null })
          : row.events,
    }),
  }));
}

export async function getMyTickets(userId: string): Promise<Ticket[]> {
  // Reconciliação na leitura: espelho velho de chamado de Motoristas não final
  // é reconsultado no Flow. É a rede de segurança do webhook (melhor esforço).
  const stale = await prisma.ticket.findMany({
    where: {
      requesterId: userId,
      destination: "MOTORISTAS",
      flowId: { not: null },
      status: { notIn: ["CONCLUIDO", "CANCELADO"] },
    },
    select: { id: true, destination: true, status: true, flowId: true, flowSyncedAt: true },
  });
  await Promise.all(stale.filter((t) => needsReconcile(t)).map((t) => reconcileTicket(t.id)));

  const rows = await prisma.ticket.findMany({
    where: {
      requesterId: userId,
      // Resolvido sai do quadro 30 min depois de concluído — a mesma janela do
      // quadro de TI (`archive-window`), para o solicitante e a equipe verem o
      // card desaparecer na mesma hora. Concluído SEM carimbo (dado legado)
      // fica: sumiria sem nunca ter passado pela janela.
      OR: [
        { status: { not: "CONCLUIDO" } },
        { status: "CONCLUIDO", finishedAt: { gte: archiveCutoff() } },
        { status: "CONCLUIDO", finishedAt: null },
      ],
    },
    orderBy: { createdAt: "desc" },
    include: {
      requester: { select: { fullName: true } },
      assignee: { select: { fullName: true } },
    },
  });

  const tickets: Ticket[] = [];
  for (const row of rows) {
    const status = STATUS_MAP[row.status] ?? null;
    if (!status) continue; // CANCELADO (ou estado desconhecido) fica fora do quadro.

    tickets.push({
      id: row.id,
      code: row.code,
      title: row.title,
      sector: DESTINATION_LABEL[row.destination] ?? row.destination,
      status,
      openedLabel: openedLabel(row.createdAt),
      requestedBy: row.requester.fullName,
      // Motorista do Flow (chamado de Motoristas) ou responsável local (TI).
      assignee: row.externalAssigneeName ?? row.assignee?.fullName,
      category: row.category ?? undefined,
      flowSyncHint:
        row.destination === "MOTORISTAS" && !row.flowId && row.flowSyncError
          ? "Aguardando envio à Logística"
          : undefined,
      proofUrl:
        row.destination === "MOTORISTAS" && row.flowId && row.status === "CONCLUIDO"
          ? `/api/integracao/flow/comprovante/${row.id}`
          : undefined,
    });
  }

  return tickets;
}
