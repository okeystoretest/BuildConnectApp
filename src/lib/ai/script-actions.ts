"use server";

import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { consume } from "@/lib/rate-limit";
import {
  requireAuthor,
  requireScope,
  requireUser,
  revalidateScope,
} from "@/lib/cronograma-guards";
import type { ActionResult } from "@/lib/cronograma-actions";
import { generateText } from "./gemini";
import { buildScriptPrompt, composeSystemInstruction } from "./script-prompt";
import { AI_RATE_LIMIT, AI_RATE_WINDOW_MS, aiRateKey, loadAiRuntime } from "./settings-data";
import { SCRIPT_MAX } from "./scopes";

/**
 * Roteiro do card: gerar pela IA e salvar a edição à mão.
 *
 * Gerar segue a regra de EDITAR o card (autor ou Admin) — é a mesma
 * `requireAuthor` das outras escritas — e passa por um teto de 20 por hora
 * por pessoa: cada chamada custa dinheiro, e um `for` no console não pode
 * virar fatura.
 *
 * Falha do Gemini NÃO toca o banco: o roteiro que já estava no card fica.
 */

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function isoTime(value: Date): string {
  return value.toISOString().slice(11, 16);
}

export async function generatePostScript(input: {
  id: string;
  slug: string;
}): Promise<ActionResult> {
  const { user, error } = await requireUser();
  if (!user) return { ok: false, error: error ?? undefined };

  const { scope, error: scopeError } = await requireScope(input.slug, user);
  if (!scope) return { ok: false, error: scopeError ?? undefined };

  const { error: authorError } = await requireAuthor(input.id, scope.id, user);
  if (authorError) return { ok: false, error: authorError };

  const limit = await consume(aiRateKey(user.id), AI_RATE_LIMIT, AI_RATE_WINDOW_MS);
  if (!limit.ok) {
    const minutes = Math.max(1, Math.ceil(limit.retryAfterSeconds / 60));
    return { ok: false, error: `Limite de roteiros por hora atingido. Tente em ${minutes} min.` };
  }

  const runtime = await loadAiRuntime();
  if (!runtime.ok) return { ok: false, error: runtime.error };

  const post = await prisma.contentPost.findFirst({
    where: { id: input.id, subsectorId: scope.id },
    select: {
      title: true,
      scheduledAt: true,
      funnel: true,
      formats: true,
      formatOther: true,
      status: true,
      brand: true,
      platforms: true,
      notes: true,
      owner: { select: { fullName: true } },
    },
  });
  if (!post) return { ok: false, error: "Post não encontrado." };

  const prompt = buildScriptPrompt({
    title: post.title,
    date: isoDate(post.scheduledAt),
    time: isoTime(post.scheduledAt),
    funnel: post.funnel,
    formats: post.formats,
    formatOther: post.formatOther ?? undefined,
    status: post.status,
    brand: post.brand ?? undefined,
    platforms: post.platforms,
    notes: post.notes ?? undefined,
    ownerName: post.owner?.fullName,
  });
  const systemInstruction = composeSystemInstruction(
    runtime.instructions.DEFAULT ?? null,
    post.brand ? (runtime.instructions[post.brand] ?? null) : null,
  );

  const result = await generateText({
    apiKey: runtime.apiKey,
    model: runtime.model,
    systemInstruction,
    prompt,
  });
  if (!result.ok) return { ok: false, error: result.error };

  try {
    const updated = await prisma.contentPost.updateMany({
      where: { id: input.id, subsectorId: scope.id },
      data: { script: result.text, scriptUpdatedAt: new Date(), scriptById: user.id },
    });
    if (updated.count === 0) return { ok: false, error: "Post não encontrado." };
  } catch (e) {
    console.error("[generatePostScript] db:", e);
    return { ok: false, error: "O roteiro foi gerado, mas não pôde ser salvo. Tente de novo." };
  }

  await revalidateScope(scope.id, input.slug);
  return { ok: true };
}

const saveSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  body: z.string().max(SCRIPT_MAX, `O roteiro tem no máximo ${SCRIPT_MAX} caracteres.`),
});

/** Edição à mão. Corpo vazio apaga o roteiro (os três campos vão a nulo). */
export async function savePostScript(input: {
  id: string;
  slug: string;
  body: string;
}): Promise<ActionResult> {
  const { user, error } = await requireUser();
  if (!user) return { ok: false, error: error ?? undefined };

  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const body = parsed.data.body.trim();

  const { scope, error: scopeError } = await requireScope(parsed.data.slug, user);
  if (!scope) return { ok: false, error: scopeError ?? undefined };

  const { error: authorError } = await requireAuthor(parsed.data.id, scope.id, user);
  if (authorError) return { ok: false, error: authorError };

  try {
    const updated = await prisma.contentPost.updateMany({
      where: { id: parsed.data.id, subsectorId: scope.id },
      data: body
        ? { script: body, scriptUpdatedAt: new Date(), scriptById: user.id }
        : { script: null, scriptUpdatedAt: null, scriptById: null },
    });
    if (updated.count === 0) return { ok: false, error: "Post não encontrado." };
  } catch (e) {
    console.error("[savePostScript] db:", e);
    return { ok: false, error: "Falha ao salvar o roteiro." };
  }

  await revalidateScope(scope.id, parsed.data.slug);
  return { ok: true };
}
