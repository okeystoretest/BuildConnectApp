"use server";

import { getCurrentUser } from "@/lib/auth/require-user";
import { resolveAccessibleSlugs, canAccessSlug } from "@/lib/auth/access";
import { getItTicketsHistory } from "@/lib/it-data-db";
import type { Role } from "@/types";
import type { ItTicket } from "@/types/it";

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
