"use server";

import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/require-user";
import { hasComprehension } from "@/lib/video-comprehension";
import { RATING_COMMENT_MAX, RATING_MAX, RATING_MIN, isEmptyRating } from "@/lib/video-rating";

interface ActionResult {
  ok: boolean;
  error?: string;
}

const star = z.number().int().min(RATING_MIN).max(RATING_MAX).nullable();

const schema = z.object({
  videoId: z.string().min(1),
  audio: star,
  image: star,
  clarity: star,
  comment: z.string().trim().max(RATING_COMMENT_MAX).optional(),
});

/**
 * Avaliação da qualidade do vídeo pelo colaborador, no fim do fluxo de
 * resposta. Tudo opcional: pular é um caminho legítimo, e pular não grava.
 */
export async function submitVideoRating(input: {
  videoId: string;
  audio: number | null;
  image: number | null;
  clarity: number | null;
  comment?: string;
}): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sessão expirada. Faça login novamente." };

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: `Use notas de ${RATING_MIN} a ${RATING_MAX}.` };
  }
  const { videoId, audio, image, clarity, comment } = parsed.data;

  // Nada marcado e nada escrito: sucesso sem gravar. O botão "Pular" passa por
  // aqui, e uma linha vazia estragaria o denominador das médias.
  if (isEmptyRating({ audio, image, clarity, comment })) return { ok: true };

  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: { kind: true, subsector: { select: { kind: true } } },
  });
  if (!video) return { ok: false, error: "Vídeo não encontrado." };
  if (!hasComprehension(video)) {
    return { ok: false, error: "Este vídeo não recebe avaliação." };
  }

  // O formulário só existe depois da resposta; sem ela, a chamada não veio do
  // fluxo.
  const answered = await prisma.videoComprehension.findFirst({
    where: { userId: user.id, videoId },
    select: { id: true },
  });
  if (!answered) {
    return { ok: false, error: "Responda à pergunta do vídeo antes de avaliar." };
  }

  try {
    const data = { audio, image, clarity, comment: comment ? comment : null };
    await prisma.videoRating.upsert({
      where: { userId_videoId: { userId: user.id, videoId } },
      create: { userId: user.id, videoId, ...data },
      update: data,
    });
    return { ok: true };
  } catch (error) {
    console.error("[submitVideoRating] falha:", error);
    return { ok: false, error: "Não foi possível enviar sua avaliação." };
  }
}
