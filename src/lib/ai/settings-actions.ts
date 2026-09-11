"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/require-user";
import { can } from "@/lib/permissions";
import { consume } from "@/lib/rate-limit";
import { encryptSecret } from "./secret";
import { generateText } from "./gemini";
import {
  AI_SETTINGS_ID,
  AI_RATE_LIMIT,
  AI_RATE_WINDOW_MS,
  aiRateKey,
  loadAiRuntime,
} from "./settings-data";
import { AI_SCOPES, API_KEY_MAX, INSTRUCTION_MAX, MODEL_MAX } from "./scopes";
import type { Role } from "@/types";

/**
 * Configuração da IA — as escritas da aba "Inteligência Artificial".
 *
 * Todas exigem `ai.manage` (hoje só o Admin): é a tela onde uma credencial
 * paga é colada. A chave entra por aqui, é cifrada ANTES de tocar o banco e
 * nunca é devolvida — nem por estas actions, nem por `getAiSettingsView`.
 */

export interface AiActionResult {
  ok: boolean;
  error?: string;
  /** Preenchido por `testAiConnection` no sucesso. */
  model?: string;
}

async function requireAiManager() {
  const user = await getCurrentUser();
  if (!user) return { user: null, error: "Sessão expirada. Faça login novamente." };
  if (!can(user.role as Role, "ai.manage")) {
    return { user: null, error: "Apenas a administração configura a IA." };
  }
  return { user, error: null };
}

const credentialsSchema = z.object({
  // Vazio ou ausente = manter a chave atual. Apagar é `removeAiKey`.
  apiKey: z.string().trim().max(API_KEY_MAX, "Chave longa demais.").optional(),
  model: z
    .string()
    .trim()
    .min(1, "Informe o modelo.")
    .max(MODEL_MAX, "Nome do modelo longo demais.")
    .regex(/^[a-z0-9][a-z0-9.\-]*$/i, "Nome do modelo inválido. Ex.: gemini-2.5-flash"),
});

export async function saveAiCredentials(input: {
  apiKey?: string;
  model: string;
}): Promise<AiActionResult> {
  const { user, error } = await requireAiManager();
  if (!user) return { ok: false, error: error ?? undefined };

  const parsed = credentialsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const { apiKey, model } = parsed.data;

  // Só entra na escrita o que mudou: sem chave nova, a cifra atual fica.
  const keyFields = apiKey
    ? { apiKeyCipher: encryptSecret(apiKey), apiKeyHint: apiKey.slice(-4) }
    : {};

  try {
    await prisma.aiSettings.upsert({
      where: { id: AI_SETTINGS_ID },
      update: { model, updatedById: user.id, ...keyFields },
      create: { id: AI_SETTINGS_ID, model, updatedById: user.id, ...keyFields },
    });
  } catch (e) {
    console.error("[saveAiCredentials] db:", e);
    return { ok: false, error: "Falha ao salvar a configuração." };
  }

  revalidatePath("/setores/ti");
  return { ok: true };
}

/** Remove a chave. O botão "Roteiro" some do Cronograma; roteiros salvos ficam. */
export async function removeAiKey(): Promise<AiActionResult> {
  const { user, error } = await requireAiManager();
  if (!user) return { ok: false, error: error ?? undefined };

  try {
    await prisma.aiSettings.updateMany({
      where: { id: AI_SETTINGS_ID },
      data: { apiKeyCipher: null, apiKeyHint: null, updatedById: user.id },
    });
  } catch (e) {
    console.error("[removeAiKey] db:", e);
    return { ok: false, error: "Falha ao remover a chave." };
  }

  revalidatePath("/setores/ti");
  return { ok: true };
}

const instructionSchema = z.object({
  scope: z.enum(AI_SCOPES),
  body: z
    .string()
    .max(INSTRUCTION_MAX, `A instrução tem no máximo ${INSTRUCTION_MAX} caracteres.`),
});

export async function saveAiInstruction(input: {
  scope: string;
  body: string;
}): Promise<AiActionResult> {
  const { user, error } = await requireAiManager();
  if (!user) return { ok: false, error: error ?? undefined };

  const parsed = instructionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const { scope } = parsed.data;
  const body = parsed.data.body.trim();

  try {
    if (body.length === 0) {
      // Instrução apagada = linha apagada. Sem linha, o escopo cai no fallback.
      await prisma.aiInstruction.deleteMany({ where: { id: scope } });
    } else {
      await prisma.aiInstruction.upsert({
        where: { id: scope },
        update: { body, updatedById: user.id },
        create: { id: scope, body, updatedById: user.id },
      });
    }
  } catch (e) {
    console.error("[saveAiInstruction] db:", e);
    return { ok: false, error: "Falha ao salvar a instrução." };
  }

  revalidatePath("/setores/ti");
  return { ok: true };
}

/**
 * Uma geração mínima para descobrir chave errada ou modelo inexistente AQUI,
 * e não na hora em que alguém precisa do roteiro. Conta no mesmo limite da
 * geração — é uma chamada paga como qualquer outra.
 */
export async function testAiConnection(): Promise<AiActionResult> {
  const { user, error } = await requireAiManager();
  if (!user) return { ok: false, error: error ?? undefined };

  const runtime = await loadAiRuntime();
  if (!runtime.ok) return { ok: false, error: runtime.error };

  const limit = await consume(aiRateKey(user.id), AI_RATE_LIMIT, AI_RATE_WINDOW_MS);
  if (!limit.ok) {
    const minutes = Math.max(1, Math.ceil(limit.retryAfterSeconds / 60));
    return { ok: false, error: `Limite de chamadas por hora atingido. Tente em ${minutes} min.` };
  }

  const result = await generateText({
    apiKey: runtime.apiKey,
    model: runtime.model,
    systemInstruction: "Responda apenas com a palavra OK.",
    prompt: "Teste de conexão.",
  });
  if (!result.ok) return { ok: false, error: result.error };

  return { ok: true, model: runtime.model };
}
