import assert from "node:assert/strict";
import test from "node:test";
import { createHmac } from "node:crypto";
import { verifyFlowSignature, MAX_SKEW_MS } from "./signature";

const secret = "s3gr3do";
const body = JSON.stringify({ connectId: "t1", status: "EM_ANDAMENTO" });
const now = 1_757_937_600_000;
function sign(ts: number, b = body, s = secret) {
  return createHmac("sha256", s).update(`${ts}.${b}`).digest("hex");
}

test("assinatura válida e dentro da janela passa", () => {
  const r = verifyFlowSignature({ secret, timestamp: String(now), signature: sign(now), body, now });
  assert.deepEqual(r, { ok: true });
});

test("corpo alterado é rejeitado", () => {
  const r = verifyFlowSignature({ secret, timestamp: String(now), signature: sign(now), body: body + " ", now });
  assert.equal(r.ok, false);
});

test("segredo diferente é rejeitado", () => {
  const r = verifyFlowSignature({ secret, timestamp: String(now), signature: sign(now, body, "outro"), body, now });
  assert.equal(r.ok, false);
});

test("timestamp fora da janela é rejeitado (repetição)", () => {
  const old = now - MAX_SKEW_MS - 1;
  const r = verifyFlowSignature({ secret, timestamp: String(old), signature: sign(old), body, now });
  assert.equal(r.ok, false);
});

test("cabeçalhos ausentes ou timestamp não numérico são rejeitados", () => {
  assert.equal(verifyFlowSignature({ secret, timestamp: null, signature: sign(now), body, now }).ok, false);
  assert.equal(verifyFlowSignature({ secret, timestamp: String(now), signature: null, body, now }).ok, false);
  assert.equal(verifyFlowSignature({ secret, timestamp: "abc", signature: sign(now), body, now }).ok, false);
});
