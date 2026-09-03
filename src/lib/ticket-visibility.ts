import type { Role } from "@/types";
import type { ItTicket, ItTicketStatus } from "@/types/it";

/**
 * Privacidade dos chamados no quadro da Retaguarda.
 *
 * | Status                      | Quem enxerga o card                        |
 * |-----------------------------|--------------------------------------------|
 * | PENDENTE                    | todo mundo com acesso ao setor              |
 * | ATRIBUIDO / EM_ANDAMENTO    | só o responsável e quem fez a atribuição    |
 * | CONCLUIDO                   | todo mundo, pela janela de 30 min           |
 *
 * EM_ANDAMENTO acompanha ATRIBUIDO porque é o passo seguinte do mesmo card:
 * deixá-lo público reabriria pela porta dos fundos o que a atribuição fechou.
 *
 * CONCLUIDO volta a ser público porque a equipe precisa conferir o desfecho.
 * O prazo NÃO é decidido aqui: a consulta já corta os concluídos com mais de
 * 30 minutos (ver `lib/archive-window`), que passam a ser lidos no Histórico.
 *
 * ADMIN é a única exceção — enxerga tudo. É quem exclui chamado e audita o
 * setor, e não dá para auditar o que não se vê. GESTOR não tem essa exceção:
 * para acompanhar um chamado, atribui.
 *
 * IMPORTANTE: esta função é a regra em forma pura, compartilhada pelos dois
 * lados. O corte que VALE é o do servidor — `getItTickets` filtra na consulta,
 * de modo que o chamado privado nem chega ao navegador de quem não pode vê-lo.
 * No cliente ela é espelho, para o quadro não piscar entre um poll e outro.
 */

/** Status em que o chamado é privado das partes envolvidas. */
const PRIVATE_STATUSES: readonly ItTicketStatus[] = ["ATRIBUIDO", "EM_ANDAMENTO"];

export interface Viewer {
  /** Id do usuário. É por id que se decide, nunca por nome — nome repete. */
  id: string;
  role: Role;
}

export function canViewTicket(ticket: ItTicket, viewer: Viewer): boolean {
  if (viewer.role === "ADMIN") return true;

  if (!PRIVATE_STATUSES.includes(ticket.status)) return true;

  return ticket.assigneeId === viewer.id || ticket.assignedById === viewer.id;
}

export function filterVisibleTickets(
  tickets: readonly ItTicket[],
  viewer: Viewer,
): readonly ItTicket[] {
  return tickets.filter((ticket) => canViewTicket(ticket, viewer));
}
