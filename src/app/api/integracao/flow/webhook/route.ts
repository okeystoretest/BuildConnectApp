import { NextResponse } from "next/server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { flowEnv } from "@/lib/flow/env";
import { verifyFlowSignature } from "@/lib/flow/signature";
import { flowStateSchema, mirrorUpdate } from "@/lib/flow/mirror";

/**
 * POST /api/integracao/flow/webhook — o Flow avisa que o chamado mudou.
 *
 * Idempotente: aplica o ESTADO recebido no espelho. Evento repetido ou fora
 * de ordem não corrompe nada; a reconciliação na leitura cobre o que se perder.
 * Autenticação por assinatura HMAC (sem cookie): o remetente é uma máquina.
 */
export const dynamic = "force-dynamic";

const payloadSchema = flowStateSchema.extend({
  connectId: z.string().min(1),
  flowId: z.string().min(1),
});

export async function POST(request: Request) {
  const env = flowEnv();
  if (!env) {
    console.error("[flow/webhook] FLOW_* ausentes; webhook rejeitado.");
    return NextResponse.json({ error: "Integração não configurada." }, { status: 503 });
  }

  const body = await request.text();
  const check = verifyFlowSignature({
    secret: env.webhookSecret,
    timestamp: request.headers.get("x-flow-timestamp"),
    signature: request.headers.get("x-flow-signature"),
    body,
  });
  if (!check.ok) {
    console.warn(`[flow/webhook] rejeitado: ${check.reason}`);
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }
  const parsed = payloadSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload inválido." }, { status: 422 });
  }
  const { connectId, flowId, ...state } = parsed.data;

  const ticket = await prisma.ticket.findUnique({
    where: { id: connectId },
    select: { id: true, destination: true, flowId: true },
  });
  if (!ticket || ticket.destination !== "MOTORISTAS") {
    return NextResponse.json({ error: "Chamado não encontrado." }, { status: 404 });
  }

  await prisma.ticket.update({
    where: { id: ticket.id },
    // flowId pode chegar aqui antes do POST de criação ter voltado (corrida
    // rara): gravar não faz mal, é o mesmo id.
    data: { ...mirrorUpdate(state), flowId: ticket.flowId ?? flowId },
  });
  revalidatePath("/chamados");
  return NextResponse.json({ ok: true });
}
