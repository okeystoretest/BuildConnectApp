import { createHmac, timingSafeEqual } from "node:crypto";

/** Janela aceita entre o relógio do Flow e o nosso. Fora dela = repetição. */
export const MAX_SKEW_MS = 5 * 60_000;

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/**
 * Verifica o webhook do Flow: HMAC-SHA256 de `${timestamp}.${corpo}` em hex,
 * nos cabeçalhos x-flow-timestamp / x-flow-signature. Puro, para os testes.
 */
export function verifyFlowSignature(input: {
  secret: string;
  timestamp: string | null;
  signature: string | null;
  body: string;
  now?: number;
}): { ok: true } | { ok: false; reason: string } {
  if (!input.timestamp || !input.signature) return { ok: false, reason: "cabeçalhos ausentes" };
  const ts = Number(input.timestamp);
  if (!Number.isFinite(ts)) return { ok: false, reason: "timestamp inválido" };
  const now = input.now ?? Date.now();
  if (Math.abs(now - ts) > MAX_SKEW_MS) return { ok: false, reason: "fora da janela de tempo" };
  const expected = createHmac("sha256", input.secret).update(`${ts}.${input.body}`).digest("hex");
  if (!safeEqual(expected, input.signature)) return { ok: false, reason: "assinatura inválida" };
  return { ok: true };
}
