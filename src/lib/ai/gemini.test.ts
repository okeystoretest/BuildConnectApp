import assert from "node:assert/strict";
import test from "node:test";
import { describeGeminiStatus, generateText, type GeminiRequest } from "./gemini";

const req: GeminiRequest = {
  apiKey: "chave-secreta",
  model: "gemini-2.5-flash",
  systemInstruction: "Seja breve.",
  prompt: "Título: teste",
};

/** fetch falso: devolve o status e o corpo pedidos, e guarda o que recebeu. */
function fakeFetch(status: number, body: unknown) {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return { impl, calls };
}

test("sucesso: concatena as partes do primeiro candidato", async () => {
  const { impl } = fakeFetch(200, {
    candidates: [{ content: { parts: [{ text: "Cena 1. " }, { text: "Cena 2." }] } }],
  });
  const result = await generateText(req, impl);
  assert.deepEqual(result, { ok: true, text: "Cena 1. Cena 2." });
});

test("a chave vai no header, nunca na URL; o modelo vai na URL", async () => {
  const { impl, calls } = fakeFetch(200, {
    candidates: [{ content: { parts: [{ text: "ok" }] } }],
  });
  await generateText(req, impl);
  const call = calls[0];
  assert.ok(call);
  assert.doesNotMatch(call.url, /chave-secreta/);
  assert.match(call.url, /\/models\/gemini-2\.5-flash:generateContent$/);
  const headers = call.init?.headers as Record<string, string>;
  assert.equal(headers["x-goog-api-key"], "chave-secreta");
  const body = JSON.parse(String(call.init?.body)) as {
    systemInstruction: { parts: Array<{ text: string }> };
    contents: Array<{ parts: Array<{ text: string }> }>;
  };
  assert.equal(body.systemInstruction.parts[0]?.text, "Seja breve.");
  assert.equal(body.contents[0]?.parts[0]?.text, "Título: teste");
});

test("resposta vazia, bloqueio ou SAFETY viram recusa", async () => {
  for (const body of [
    { candidates: [] },
    { candidates: [{ content: { parts: [{ text: "   " }] } }] },
    { promptFeedback: { blockReason: "SAFETY" } },
    { candidates: [{ finishReason: "SAFETY", content: { parts: [{ text: "x" }] } }] },
  ]) {
    const { impl } = fakeFetch(200, body);
    const result = await generateText(req, impl);
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /recusou/);
  }
});

test("status HTTP é traduzido, sem vazar o corpo do Google", async () => {
  const cases: Array<[number, RegExp]> = [
    [400, /Chave da API inválida/],
    [401, /Chave da API inválida/],
    [403, /Chave da API inválida/],
    [404, /modelo "gemini-2\.5-flash" não existe/],
    [429, /Cota do Gemini esgotada/],
    [500, /não respondeu/],
    [503, /não respondeu/],
  ];
  for (const [status, pattern] of cases) {
    const { impl } = fakeFetch(status, { error: { message: "SEGREDO-DO-GOOGLE" } });
    const result = await generateText(req, impl);
    assert.equal(result.ok, false, `status ${status}`);
    if (!result.ok) {
      assert.match(result.error, pattern, `status ${status}`);
      assert.doesNotMatch(result.error, /SEGREDO-DO-GOOGLE/);
    }
  }
});

test("falha de rede vira 'não respondeu'", async () => {
  const impl = (async () => {
    throw new Error("ECONNRESET");
  }) as typeof fetch;
  const result = await generateText(req, impl);
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /não respondeu/);
});

test("describeGeminiStatus cobre o desconhecido como 'não respondeu'", () => {
  assert.match(describeGeminiStatus(0, "m"), /não respondeu/);
  assert.match(describeGeminiStatus(418, "m"), /não respondeu/);
});
