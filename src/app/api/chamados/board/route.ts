import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getItTickets } from "@/lib/it-data-db";
import { getDriverTickets } from "@/lib/driver-data-db";
import type { ItTicket } from "@/types/it";

export const dynamic = "force-dynamic";

/**
 * Leitura dos chamados de um board (TI ou Motoristas) para sincronização
 * "quase em tempo real" via polling no cliente. Devolve os mesmos DTOs que
 * a página server-side monta na carga inicial, já com anexos e comprovante.
 *
 * Autenticado; qualquer usuário logado que acesse o board pode consultar —
 * a visibilidade fina por papel é reforçada no próprio board (TI) e nas
 * Server Actions de mutação.
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const destination = (searchParams.get("destination") ?? "TI").toUpperCase();

  try {
    let tickets: ItTicket[];
    if (destination === "MOTORISTAS") {
      tickets = await getDriverTickets();
    } else if (destination === "TI") {
      tickets = await getItTickets();
    } else {
      return NextResponse.json({ error: "Destino inválido." }, { status: 400 });
    }
    return NextResponse.json({ tickets }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[api/chamados/board] falha:", e);
    return NextResponse.json({ error: "Falha ao carregar os chamados." }, { status: 500 });
  }
}
