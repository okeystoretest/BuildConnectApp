import { getCurrentUser } from "@/lib/auth/require-user";
import { resolveAccessibleSlugs, canAccessSlug } from "@/lib/auth/access";
import { prisma } from "@/lib/db/prisma";
import { fetchFlowProof, FlowUnavailableError } from "@/lib/flow/client";
import type { Role } from "@/types";

/**
 * GET /api/integracao/flow/comprovante/[ticketId] — foto do comprovante de um
 * chamado gerido no Flow. Sessão do Connect na porta; token de serviço na
 * ida ao Flow. Mesma régua de acesso do rastreamento: solicitante, ou quem
 * tem o setor Motoristas.
 */
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ ticketId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return new Response("Não autenticado", { status: 401 });

  const { ticketId } = await params;
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { requesterId: true, flowId: true, destination: true },
  });
  if (!ticket || ticket.destination !== "MOTORISTAS" || !ticket.flowId) {
    return new Response("Not found", { status: 404 });
  }
  let liberado = ticket.requesterId === user.id;
  if (!liberado) {
    const slugs = await resolveAccessibleSlugs(user.id, user.role as Role);
    liberado = canAccessSlug(slugs, "motoristas");
  }
  if (!liberado) return new Response("Sem permissão", { status: 403 });

  try {
    const res = await fetchFlowProof(ticketId);
    if (!res.ok) return new Response("Not found", { status: 404 });
    return new Response(await res.arrayBuffer(), {
      status: 200,
      headers: { "content-type": "image/webp", "Cache-Control": "private, max-age=300" },
    });
  } catch (e) {
    if (e instanceof FlowUnavailableError) return new Response("Logística indisponível", { status: 503 });
    throw e;
  }
}
