import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/require-user";
import { resolveAccessibleSlugs, canAccessSlug } from "@/lib/auth/access";
import { prisma } from "@/lib/db/prisma";
import type { Role } from "@/types";
import { getTripTracking } from "@/lib/tracking/trip-tracking-data";

/**
 * GET /api/chamados/[id]/tracking
 *
 * Devolve o TripTracking corrente do chamado, consumido pelo polling do
 * useTripTracking. Sempre dinâmico (nunca cacheado).
 *
 * Autorização: quem tem relação com a corrida. A posição do motorista é dado
 * de localização de uma pessoa identificável, em tempo real — antes bastava
 * estar logado e ter o id do chamado para acompanhar qualquer corrida.
 *
 * Passam três casos, que cobrem todo o uso real da tela (o painel só é
 * renderizado no modal de "Meus Chamados"):
 *  - o solicitante, acompanhando a própria entrega;
 *  - o motorista atribuído;
 *  - quem tem o quadro de Motoristas (inclui ADMIN, sem filtro).
 *
 * Um 404 é devolvido quando ainda não há corrida iniciada, para o front tratar
 * como "sem tracking".
 */
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const { id: ticketId } = await params;
  if (!ticketId) {
    return NextResponse.json({ error: "Chamado inválido." }, { status: 400 });
  }

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { requesterId: true, assigneeId: true },
  });
  if (!ticket) {
    return NextResponse.json({ error: "Chamado não encontrado." }, { status: 404 });
  }

  let liberado = ticket.requesterId === user.id || ticket.assigneeId === user.id;
  if (!liberado) {
    const slugs = await resolveAccessibleSlugs(user.id, user.role as Role);
    liberado = canAccessSlug(slugs, "motoristas");
  }
  if (!liberado) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
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
