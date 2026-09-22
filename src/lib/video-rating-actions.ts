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

  /*
   * Nada marcado e nada escrito. Uma linha vazia estragaria o denominador das
   * médias, então ela não é criada — e, se já existir uma, é APAGADA.
   *
   * Apagar importa desde que a avaliação pode ser refeita: quem reabre o
   * vídeo, desmarca tudo e envia está dizendo "não quero mais avaliar". Só
   * não gravar deixaria a nota antiga no banco enquanto a tela mostra vazio,
   * e o gestor continuaria vendo uma avaliação que a pessoa retirou.
   */
  if (isEmptyRating({ audio, image, clarity, comment })) {
    await prisma.videoRating.deleteMany({ where: { userId: user.id, videoId } });
    return { ok: true };
  }

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

/** O que a pessoa já respondeu sobre este vídeo, para o formulário reabrir preenchido. */
export interface MyVideoRating {
  audio: number | null;
  image: number | null;
  clarity: number | null;
  comment: string;
}

/**
 * A avaliação que o usuário logado deu a este vídeo, ou nula se nunca avaliou.
 *
 * Buscada só quando o formulário abre, e não junto da listagem: carregar a
 * avaliação de todo vídeo de todo card para exibir zero formulários seria
 * pagar uma consulta por miniatura.
 */
export async function getMyVideoRating(videoId: string): Promise<MyVideoRating | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const row = await prisma.videoRating.findUnique({
    where: { userId_videoId: { userId: user.id, videoId } },
    select: { audio: true, image: true, clarity: true, comment: true },
  });
  if (!row) return null;

  return {
    audio: row.audio,
    image: row.image,
    clarity: row.clarity,
    comment: row.comment ?? "",
  };
}
