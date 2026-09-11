import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { sweepAvailability } from "@/lib/evaluation-schedule";
import { drainOutbox, scheduleOutboxTick } from "@/lib/whatsapp/outbox";

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

  // Mesma régua do session.ts: comparar segredo com "===" para no primeiro
  // byte diferente e vaza informação por tempo. timingSafeEqual exige buffers
  // do mesmo tamanho, daí a checagem de comprimento antes.
  const a = Buffer.from(token);
  const b = Buffer.from(secret);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Não autorizado." }, { status: 401 });
  }

  try {
    const released = await sweepAvailability();

    // Drena a fila do WhatsApp na mesma passada. Vem DEPOIS da varredura de
    // propósito: o que ela acabou de liberar já sai nesta rodada, em vez de
    // esperar o agendador acordar.
    //
    // A drenagem não dorme: envia só o que venceu (o intervalo sorteado entre
    // mensagens, de 1 s a 2 h, vive no banco) e devolve na hora. O agendador
    // do processo é reacordado por garantia — é ele que cuida do resto.
    const whatsapp = await drainOutbox({ limit: 15 }).catch((e) => {
      // Falha no WhatsApp não pode derrubar a varredura de avaliações, que é
      // a razão original desta rota.
      console.error("[cron/evaluations] fila do WhatsApp:", e);
      return null;
    });
    scheduleOutboxTick();

    return NextResponse.json({ ok: true, released, whatsapp });
  } catch (e) {
    console.error("[cron/evaluations] falha:", e);
    return NextResponse.json({ ok: false, error: "Falha na varredura." }, { status: 500 });
  }
}
