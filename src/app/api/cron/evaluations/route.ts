import { NextResponse } from "next/server";
import { sweepAvailability } from "@/lib/evaluation-schedule";

/**
 * Varredura de liberação de ciclos, protegida por token.
 *
 * Como não há cron garantido na VPS, esta rota permite disparar a liberação
 * externamente (crontab/PM2/uptime-monitor). A liberação também ocorre sob
 * demanda ao abrir a aba de Avaliações — esta rota é um reforço opcional.
 *
 * Uso:
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://app/api/cron/evaluations
 *
 * Configuração no PM2 (exemplo de crontab do servidor):
 *   0 8 * * 1-5  curl -s -H "Authorization: Bearer <token>" http://localhost:3000/api/cron/evaluations
 */

export const dynamic = "force-dynamic";

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  // Sem segredo configurado, a rota fica desabilitada (evita disparo anônimo).
  if (!secret) return false;

  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : header;
  return token === secret;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Não autorizado." }, { status: 401 });
  }

  try {
    const released = await sweepAvailability();
    return NextResponse.json({ ok: true, released });
  } catch (e) {
    console.error("[cron/evaluations] falha:", e);
    return NextResponse.json({ ok: false, error: "Falha na varredura." }, { status: 500 });
  }
}
