"use server";

import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/require-user";
import { can } from "@/lib/permissions";
import { canGrade } from "@/lib/video-comprehension-scope";
import { loadGraderCandidates } from "@/lib/video-comprehension-data";
import {
  COMPREHENSION_GRADE_MAX,
  COMPREHENSION_MAX,
  COMPREHENSION_MIN,
} from "@/lib/video-comprehension";
import type { Role } from "@/types";

interface ActionResult {
  ok: boolean;
  error?: string;
}

const submitSchema = z.object({
  videoId: z.string().min(1),
  answer: z.string().trim().min(COMPREHENSION_MIN).max(COMPREHENSION_MAX),
});

/**
 * Resposta à pergunta de compreensão, escrita ao concluir uma Instrução em
 * Vídeo. Uma por usuário por vídeo; não se edita depois de enviada.
 *
 * Só vídeos da ferramenta Instruções em Vídeo: subsetor PADRAO e qualquer
 * tipo que não seja WORKSHOP — a aba é identificada assim, não pelo `kind`
 * (há vídeos `VIDEO` antigos nela).
 */
export async function submitVideoComprehension(input: {
  videoId: string;
  answer: string;
}): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sessão expirada. Faça login novamente." };

  const parsed = submitSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: `Escreva entre ${COMPREHENSION_MIN} e ${COMPREHENSION_MAX} caracteres.`,
    };
  }
  const { videoId, answer } = parsed.data;

  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: { kind: true, subsector: { select: { kind: true } } },
  });
  if (!video) return { ok: false, error: "Vídeo não encontrado." };
  if (video.kind === "WORKSHOP" || video.subsector.kind !== "PADRAO") {
    return { ok: false, error: "Este vídeo não tem avaliação de compreensão." };
  }

  try {
    await prisma.videoComprehension.create({ data: { userId: user.id, videoId, answer } });
    return { ok: true };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, error: "Você já respondeu sobre este vídeo." };
    }
    console.error("[submitVideoComprehension] falha:", error);
    return { ok: false, error: "Não foi possível enviar sua resposta." };
  }
}

const gradeSchema = z.object({
  id: z.string().min(1),
  grade: z.number().int().min(0).max(COMPREHENSION_GRADE_MAX),
  comment: z.string().trim().max(2000).optional(),
});

/**
 * Nota do Gestor (0–10) a uma resposta de compreensão. Quem pode dar a nota
 * sai de `resolveGraders` (Gestores do setor do autor; Admin/DHO no fallback)
 * — conferido aqui, não só na lista da tela. O primeiro que avalia fecha:
 * o update é condicionado a `gradedAt IS NULL`.
 */
export async function gradeVideoComprehension(input: {
  id: string;
  grade: number;
  comment?: string;
}): Promise<ActionResult> {
  const actor = await getCurrentUser();
  if (!actor) return { ok: false, error: "Sessão expirada. Faça login novamente." };
  if (!can(actor.role as Role, "evaluations.view")) {
    return { ok: false, error: "Sem permissão para avaliar." };
  }

  const parsed = gradeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: `Nota inválida: use um inteiro de 0 a ${COMPREHENSION_GRADE_MAX}.` };
  const { id, grade, comment } = parsed.data;

  const target = await prisma.videoComprehension.findUnique({
    where: { id },
    select: { gradedAt: true, user: { select: { id: true, sectorId: true } } },
  });
  if (!target) return { ok: false, error: "Resposta não encontrada." };
  if (target.gradedAt) return { ok: false, error: "Esta resposta já foi avaliada." };

  const candidates = await loadGraderCandidates();
  const me = candidates.find((c) => c.id === actor.id);
  const author = { authorId: target.user.id, authorSectorId: target.user.sectorId };
  if (!me || !canGrade(me, author, candidates)) {
    return { ok: false, error: "Esta resposta não cabe a você avaliar." };
  }

  try {
    const { count } = await prisma.videoComprehension.updateMany({
      where: { id, gradedAt: null },
      data: {
        grade,
        graderComment: comment ? comment : null,
        gradedById: actor.id,
        gradedAt: new Date(),
      },
    });
    if (count === 0) return { ok: false, error: "Outro gestor acabou de avaliar esta resposta." };
    return { ok: true };
  } catch (error) {
    console.error("[gradeVideoComprehension] falha:", error);
    return { ok: false, error: "Não foi possível registrar a nota." };
  }
}
