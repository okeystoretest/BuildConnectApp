import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/require-user";
import { getTripTracking } from "@/lib/tracking/trip-tracking-data";

/**
 * GET /api/chamados/[id]/tracking
 *
 * Devolve o TripTracking corrente do chamado, consumido pelo polling do
 * useTripTracking. Sempre dinâmico (nunca cacheado).
 *
 * Autorização: qualquer usuário autenticado que enxergue o chamado. A regra
 * "quem vê o chamado" foi definida como aberta a todos os autenticados —
 * reforçada aqui no backend por id (não por nome). Um 404 é devolvido quando
 * ainda não há corrida iniciada, para o front tratar como "sem tracking".
 */
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const ticketId = params.id;
  if (!ticketId) {
    return NextResponse.json({ error: "Chamado inválido." }, { status: 400 });
  }

  try {
    const tracking = await getTripTracking(ticketId);
    if (!tracking) {
      return NextResponse.json({ error: "Corrida não iniciada." }, { status: 404 });
    }
    return NextResponse.json(tracking, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("[GET tracking] falha:", error);
    return NextResponse.json(
      { error: "Não foi possível obter a posição." },
      { status: 500 },
    );
  }
}
