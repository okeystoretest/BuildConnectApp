"use server";

import { getSession } from "@/lib/auth/session";
import { getItTicketsHistory } from "@/lib/it-data-db";
import { getDriverTicketsHistory } from "@/lib/driver-data-db";
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
 * Exige sessão — mesma régua da rota de leitura do board. É consulta sob
 * demanda (abre com o botão "Histórico"), não entra na carga da página.
 */
export async function listTicketHistory(
  destination: "TI" | "MOTORISTAS",
): Promise<TicketHistoryResult> {
  const session = await getSession();
  if (!session) {
    return { ok: false, tickets: [], error: "Sessão expirada. Faça login novamente." };
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
