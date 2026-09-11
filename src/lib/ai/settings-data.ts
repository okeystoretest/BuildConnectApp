import { prisma } from "@/lib/db/prisma";
import { decryptSecret } from "./secret";
import { AI_SCOPES, DEFAULT_MODEL, type AiScope } from "./scopes";

/**
 * Leitura da configuração de IA.
 *
 * Duas leituras com fronteira clara:
 *  - `getAiSettingsView` é o que a TELA recebe. Não existe caminho de código
 *    aqui que devolva `apiKeyCipher` ou a chave em claro — só `hasKey` e os
 *    4 últimos caracteres;
 *  - `loadAiRuntime` é a ÚNICA função que decifra a chave, e só as actions
 *    que chamam o Gemini a usam. O resultado nunca é serializado ao cliente.
 */

export const AI_SETTINGS_ID = "singleton";

/** Rate limit de geração: por pessoa, 20 por hora. */
export const AI_RATE_LIMIT = 20;
export const AI_RATE_WINDOW_MS = 60 * 60 * 1000;
export function aiRateKey(userId: string): string {
  return `ai-script:user:${userId}`;
}

export interface AiInstructionView {
  body: string;
  /** ISO. Nulo quando o escopo nunca foi salvo. */
  updatedAt: string | null;
  updatedByName: string | null;
}

export interface AiSettingsView {
  hasKey: boolean;
  /** Últimos 4 caracteres da chave salva, ou null. */
  keyHint: string | null;
  model: string;
  instructions: Record<AiScope, AiInstructionView>;
}

function isScope(id: string): id is AiScope {
  return (AI_SCOPES as readonly string[]).includes(id);
}

export async function getAiSettingsView(): Promise<AiSettingsView> {
  const [settings, rows] = await Promise.all([
    prisma.aiSettings.findUnique({
      where: { id: AI_SETTINGS_ID },
      select: { apiKeyHint: true, apiKeyCipher: true, model: true },
    }),
    prisma.aiInstruction.findMany({
      select: {
        id: true,
        body: true,
        updatedAt: true,
        updatedBy: { select: { fullName: true } },
      },
    }),
  ]);

  const empty: AiInstructionView = { body: "", updatedAt: null, updatedByName: null };
  const instructions = Object.fromEntries(
    AI_SCOPES.map((scope) => [scope, { ...empty }]),
  ) as Record<AiScope, AiInstructionView>;

  for (const row of rows) {
    if (isScope(row.id)) {
      instructions[row.id] = {
        body: row.body,
        updatedAt: row.updatedAt.toISOString(),
        updatedByName: row.updatedBy?.fullName ?? null,
      };
    }
  }

  return {
    // `hasKey` deriva da cifra, não do hint: é a cifra que a geração usa.
    hasKey: Boolean(settings?.apiKeyCipher),
    keyHint: settings?.apiKeyCipher ? (settings.apiKeyHint ?? null) : null,
    model: settings?.model ?? DEFAULT_MODEL,
    instructions,
  };
}

/** Há chave salva? É o que liga o botão "Roteiro" no Cronograma. */
export async function isAiReady(): Promise<boolean> {
  const row = await prisma.aiSettings.findUnique({
    where: { id: AI_SETTINGS_ID },
    select: { apiKeyCipher: true },
  });
  return Boolean(row?.apiKeyCipher);
}

export type AiRuntime =
  | {
      ok: true;
      apiKey: string;
      model: string;
      instructions: Partial<Record<AiScope, string>>;
    }
  | { ok: false; error: string };

/**
 * Chave decifrada + modelo + instruções, para chamar o Gemini. Só o servidor
 * vê o retorno. Cifra ilegível (SESSION_SECRET trocado) vira erro com a
 * saída — recolar a chave.
 */
export async function loadAiRuntime(): Promise<AiRuntime> {
  const [settings, rows] = await Promise.all([
    prisma.aiSettings.findUnique({
      where: { id: AI_SETTINGS_ID },
      select: { apiKeyCipher: true, model: true },
    }),
    prisma.aiInstruction.findMany({ select: { id: true, body: true } }),
  ]);

  if (!settings?.apiKeyCipher) {
    return {
      ok: false,
      error: "A IA não está configurada. Peça à Retaguarda para salvar a chave da API.",
    };
  }

  let apiKey: string;
  try {
    apiKey = decryptSecret(settings.apiKeyCipher);
  } catch (e) {
    console.error("[ai] chave ilegível:", e);
    return {
      ok: false,
      error:
        "Chave da API ilegível — salve-a de novo na aba Inteligência Artificial da Retaguarda.",
    };
  }

  const instructions: Partial<Record<AiScope, string>> = {};
  for (const row of rows) {
    if (isScope(row.id)) instructions[row.id] = row.body;
  }

  return { ok: true, apiKey, model: settings.model || DEFAULT_MODEL, instructions };
}
