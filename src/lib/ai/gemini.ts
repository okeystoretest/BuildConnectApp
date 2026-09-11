/**
 * A chamada ao Gemini — e só ela.
 *
 * `fetch` puro contra a API REST (sem SDK: o package.json não muda e o que
 * sai daqui é exatamente o que está escrito aqui). A chave vai no header
 * `x-goog-api-key`, nunca na URL — URL cai em log de proxy, header não.
 *
 * Tudo que o Google devolve de erro fica no `console.error` do servidor. A
 * tela recebe uma das frases de `describeGeminiStatus`, em português, que
 * dizem à pessoa o que fazer (trocar a chave, conferir o modelo, esperar) sem
 * repassar o corpo cru — que às vezes ecoa a própria requisição.
 */

export interface GeminiRequest {
  apiKey: string;
  model: string;
  systemInstruction: string;
  prompt: string;
}

export type GeminiResult = { ok: true; text: string } | { ok: false; error: string };

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const TIMEOUT_MS = 45_000;

const REFUSED =
  "O Gemini recusou gerar este roteiro. Ajuste as observações do card ou as instruções na Retaguarda.";

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
}

/** Mensagem para a tela a partir do status HTTP. 0 = rede/timeout. */
export function describeGeminiStatus(status: number, model: string): string {
  if (status === 400 || status === 401 || status === 403) {
    return "Chave da API inválida ou sem acesso ao modelo. Confira a chave na Retaguarda.";
  }
  if (status === 404) return `O modelo "${model}" não existe. Confira o nome na Retaguarda.`;
  if (status === 429) return "Cota do Gemini esgotada. Tente novamente em alguns minutos.";
  return "O Gemini não respondeu. Tente novamente.";
}

export async function generateText(
  req: GeminiRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<GeminiResult> {
  const url = `${BASE_URL}/${encodeURIComponent(req.model)}:generateContent`;

  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": req.apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: req.systemInstruction }] },
        contents: [{ role: "user", parts: [{ text: req.prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    console.error("[gemini] rede/timeout:", e);
    return { ok: false, error: describeGeminiStatus(0, req.model) };
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error(`[gemini] HTTP ${response.status}:`, detail.slice(0, 2000));
    return { ok: false, error: describeGeminiStatus(response.status, req.model) };
  }

  let body: GeminiResponse;
  try {
    body = (await response.json()) as GeminiResponse;
  } catch (e) {
    console.error("[gemini] corpo ilegível:", e);
    return { ok: false, error: describeGeminiStatus(0, req.model) };
  }

  const candidate = body.candidates?.[0];
  const text = (candidate?.content?.parts ?? [])
    .map((part) => part.text ?? "")
    .join("")
    .trim();

  if (!text || body.promptFeedback?.blockReason || candidate?.finishReason === "SAFETY") {
    console.error(
      "[gemini] recusa:",
      body.promptFeedback?.blockReason ?? candidate?.finishReason ?? "vazio",
    );
    return { ok: false, error: REFUSED };
  }

  return { ok: true, text };
}
