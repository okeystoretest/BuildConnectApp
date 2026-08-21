import type { Role } from "@/types";
import type { ItTicket, ItTicketStatus } from "@/types/it";

/**
 * Privacidade de chamados.
 *
 * IMPORTANTE: isto é a camada visual. A ocultação real precisa ser
 * reforçada no backend — a query deve devolver apenas o que o usuário
 * pode ver. Filtrar só no cliente não é segurança.
 *
 * Regra:
 * - PENDENTE/ATRIBUIDO em aberto → visível a todo o setor.
 * - ATRIBUIDO com responsável / EM_ANDAMENTO → privado: apenas o
 *   responsável atribuído, o gestor do setor e o admin veem.
 */

const OPEN_STATUSES: readonly ItTicketStatus[] = ["PENDENTE"];

export interface Viewer {
  name: string;
  role: Role;
}

export function canViewTicket(ticket: ItTicket, viewer: Viewer): boolean {
  // Gestor e Admin enxergam tudo do setor.
  if (viewer.role === "GESTOR" || viewer.role === "ADMIN") return true;

  // Status aberto sem dono é público para o setor.
  const isOpen = OPEN_STATUSES.includes(ticket.status) && !ticket.assignee;
  if (isOpen) return true;

  // A partir daqui o chamado é privado: só o próprio responsável.
  return ticket.assignee === viewer.name;
}

export function filterVisibleTickets(
  tickets: readonly ItTicket[],
  viewer: Viewer,
): readonly ItTicket[] {
  return tickets.filter((ticket) => canViewTicket(ticket, viewer));
}
