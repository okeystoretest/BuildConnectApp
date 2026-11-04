"use server";

import { getCurrentUser } from "@/lib/auth/require-user";
import { resolveAccessibleSlugs, canAccessSlug } from "@/lib/auth/access";
import { getItTicketsHistory } from "@/lib/it-data-db";
import { getMyTicketHistory } from "@/lib/my-tickets-data";
import type { Role } from "@/types";
import type { ItTicket } from "@/types/it";
import type { Ticket } from "@/types/content";

export interface TicketHistoryResult {
  ok: boolean;
  tickets: ItTicket[];
  error?: string;
}

/**
 * Histórico de chamados de um quadro: só os CONCLUÍDOS que já passaram da
 * janela de 30 minutos e saíram do quadro principal.
 *
 * Mesma régua da rota de leitura do board: RBAC por subsetor, não apenas
 * "estar logado" — o histórico devolve os mesmos campos dos chamados. É
 * consulta sob demanda (botão "Histórico"), não entra na carga da página.
 */
export async function listTicketHistory(
  destination: "TI" | "MOTORISTAS",
): Promise<TicketHistoryResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, tickets: [], error: "Sessão expirada. Faça login novamente." };
  }

  // O histórico de Motoristas mudou para o Build.Flow.
  if (destination === "MOTORISTAS") {
    return { ok: false, tickets: [], error: "Chamados de Motoristas são geridos no Build.Flow." };
  }

  const slugs = await resolveAccessibleSlugs(user.id, user.role as Role);
  if (!canAccessSlug(slugs, "ti")) {
    return { ok: false, tickets: [], error: "Você não tem acesso a este quadro." };
  }

  try {
    const tickets = await getItTicketsHistory();
    return { ok: true, tickets };
  } catch (error) {
    console.error("[listTicketHistory] falha:", error);
    return { ok: false, tickets: [], error: "Não foi possível carregar o histórico." };
  }
}

export interface MyTicketHistoryResult {
  ok: boolean;
  tickets: Ticket[];
  error?: string;
}

/**
 * Histórico do SOLICITANTE: os chamados concluídos que ele próprio abriu, cada
 * um com a linha do tempo completa.
 *
 * Não há RBAC de quadro aqui — e não deveria haver: a consulta é fechada em
 * `requesterId = user.id`, então ninguém lê chamado de outra pessoa nem
 * precisa de acesso ao setor para reler o próprio.
 */
export async function listMyTicketHistory(): Promise<MyTicketHistoryResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, tickets: [], error: "Sessão expirada. Faça login novamente." };
  }

  try {
    const tickets = await getMyTicketHistory(user.id);
    return { ok: true, tickets };
  } catch (error) {
    console.error("[listMyTicketHistory] falha:", error);
    return { ok: false, tickets: [], error: "Não foi possível carregar o histórico." };
  }
}
