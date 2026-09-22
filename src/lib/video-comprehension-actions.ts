"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/require-user";
import { can } from "@/lib/permissions";
import { canGrade } from "@/lib/video-comprehension-scope";
import { loadGraderCandidates } from "@/lib/video-comprehension-data";
import {
  COMPREHENSION_GRADE_MAX,
  COMPREHENSION_GRADE_MIN,
  COMPREHENSION_MAX,
  COMPREHENSION_MIN,
  hasComprehension,
  isPassing,
} from "@/lib/video-comprehension";
import { resolveGraders } from "@/lib/video-comprehension-scope";
import {
  notifyComprehensionRejected,
  notifyGraderQueue,
} from "@/lib/notifications/notify";
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
 * Resposta à pergunta de compreensão de uma Instrução em Vídeo. Uma por
 * usuário por vídeo; não se edita depois de enviada. É ela que marca o vídeo
 * como ASSISTIDO — chegar ao fim só libera a pergunta.
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
  if (!hasComprehension(video)) {
    return { ok: false, error: "Este vídeo não tem avaliação de compreensão." };
  }

  // A pergunta só é oferecida no fim do vídeo: sem `endedAt`, a chamada não
  // veio do player.
  const progress = await prisma.contentProgress.findUnique({
    where: { userId_videoId: { userId: user.id, videoId } },
    select: { endedAt: true },
  });
  if (!progress?.endedAt) {
    return { ok: false, error: "Assista ao vídeo até o fim antes de responder." };
  }

  // Tentativa pendente bloqueia: responder de novo enquanto o Gestor não deu a
  // nota criaria duas respostas na fila sobre o mesmo vídeo.
  const awaiting = await prisma.videoComprehension.findFirst({
    where: { userId: user.id, videoId, gradedAt: null },
    select: { id: true },
  });
  if (awaiting) return { ok: false, error: "Sua resposta anterior ainda está em avaliação." };

  try {
    const now = new Date();
    const last = await prisma.videoComprehension.findFirst({
      where: { userId: user.id, videoId },
      orderBy: { attempt: "desc" },
      select: { attempt: true },
    });
    const attempt = (last?.attempt ?? 0) + 1;

    await prisma.$transaction([
      prisma.videoComprehension.create({ data: { userId: user.id, videoId, answer, attempt } }),
      // Responder é o que conclui o vídeo. Reprovar desfaz isto.
      prisma.contentProgress.update({
        where: { userId_videoId: { userId: user.id, videoId } },
        data: { completed: true, completedAt: now },
      }),
    ]);

    // Fila do Gestor num novo patamar de 5. Depois do commit e sem lançar: o
    // aviso é consequência do envio, não condição dele.
    const candidates = await loadGraderCandidates();
    const graders = resolveGraders(
      { authorId: user.id, authorSectorId: user.sectorId },
      candidates,
    );
    void notifyGraderQueue(graders.map((g) => g.id));

    // A pendência nasce em Minhas Avaliações dos Gestores.
    revalidatePath("/minhas-avaliacoes");
    return { ok: true };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      // Dois envios simultâneos: o unique [userId, videoId, attempt] barra o
      // segundo.
      return { ok: false, error: "Sua resposta anterior ainda está em avaliação." };
    }
    console.error("[submitVideoComprehension] falha:", error);
    return { ok: false, error: "Não foi possível enviar sua resposta." };
  }
}

const gradeSchema = z.object({
  id: z.string().min(1),
  grade: z.number().int().min(COMPREHENSION_GRADE_MIN).max(COMPREHENSION_GRADE_MAX),
  comment: z.string().trim().max(2000).optional(),
});

/**
 * Nota do Gestor (1–10) a uma resposta de compreensão. Abaixo de 7 reprova: o
 * vídeo volta a pendente, o `endedAt` é zerado (obriga a reassistir) e o
 * colaborador é avisado pelo sino. Quem pode dar a nota
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
  if (!parsed.success) {
    return {
      ok: false,
      error: `Nota inválida: use um inteiro de ${COMPREHENSION_GRADE_MIN} a ${COMPREHENSION_GRADE_MAX}.`,
    };
  }
  const { id, grade, comment } = parsed.data;

  const target = await prisma.videoComprehension.findUnique({
    where: { id },
    select: {
      gradedAt: true,
      videoId: true,
      video: { select: { title: true, subsector: { select: { slug: true } } } },
      user: { select: { id: true, sectorId: true } },
    },
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

    // Reprovado: o vídeo volta a pendente e o `endedAt` é zerado — sem isso, o
    // colaborador responderia de novo sem reassistir.
    if (!isPassing(grade)) {
      await prisma.contentProgress.update({
        where: { userId_videoId: { userId: target.user.id, videoId: target.videoId } },
        data: { completed: false, completedAt: null, endedAt: null },
      });
      void notifyComprehensionRejected({
        userId: target.user.id,
        videoId: target.videoId,
        videoTitle: target.video.title,
        subsectorSlug: target.video.subsector.slug,
      });
      revalidatePath("/progresso");
    }

    revalidatePath("/minhas-avaliacoes");
    revalidatePath("/setores/rh");
    return { ok: true };
  } catch (error) {
    console.error("[gradeVideoComprehension] falha:", error);
    return { ok: false, error: "Não foi possível registrar a nota." };
  }
}
