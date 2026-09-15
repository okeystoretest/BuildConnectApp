import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { resyncPendingTickets } from "@/lib/flow/sync";

/**
 * GET /api/cron/flow-sync — reenvia ao Build.Flow os chamados de Motoristas
 * que ainda não chegaram lá (Flow fora do ar na abertura). Agende a cada
 * minuto no EasyPanel:
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://app/api/cron/flow-sync
 * Mesma proteção da rota de avaliações.
 */
export const dynamic = "force-dynamic";

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  // Sem segredo configurado, a rota fica desabilitada (evita disparo anônimo).
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : header;
  const a = Buffer.from(token);
  const b = Buffer.from(secret);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Não autorizado." }, { status: 401 });
  }
  const result = await resyncPendingTickets();
  return NextResponse.json({ ok: true, ...result });
}
