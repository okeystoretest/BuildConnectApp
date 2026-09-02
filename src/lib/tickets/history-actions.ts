"use server";

import { getCurrentUser } from "@/lib/auth/require-user";
import { resolveAccessibleSlugs, canAccessSlug } from "@/lib/auth/access";
import { getItTicketsHistory } from "@/lib/it-data-db";
import { getDriverTicketsHistory } from "@/lib/driver-data-db";
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

  const slugs = await resolveAccessibleSlugs(user.id, user.role as Role);
  const slug = destination === "MOTORISTAS" ? "motoristas" : "ti";
  if (!canAccessSlug(slugs, slug)) {
    return { ok: false, tickets: [], error: "Você não tem acesso a este quadro." };
  }

  try {
    const tickets =
      destination === "MOTORISTAS"
        ? await getDriverTicketsHistory()
        : await getItTicketsHistory();
    return { ok: true, tickets };
  } catch (error) {
    console.error("[listTicketHistory] falha:", error);
    return { ok: false, tickets: [], error: "Não foi possível carregar o histórico." };
  }
}
