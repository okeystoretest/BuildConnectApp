import { prisma } from "@/lib/db/prisma";
import type { Ticket, TicketStatus } from "@/types/content";

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

/** Rótulo relativo de abertura (hoje / ontem / dd/mm). */
function openedLabel(date: Date): string {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round(
    (startOfToday.getTime() - startOfDate.getTime()) / (24 * 60 * 60 * 1000),
  );

  if (diffDays <= 0) return "aberto hoje";
  if (diffDays === 1) return "aberto ontem";
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `aberto ${dd}/${mm}`;
}

export async function getMyTickets(userId: string): Promise<Ticket[]> {
  const rows = await prisma.ticket.findMany({
    where: { requesterId: userId },
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
      assignee: row.assignee?.fullName,
      category: row.category ?? undefined,
    });
  }

  return tickets;
}
