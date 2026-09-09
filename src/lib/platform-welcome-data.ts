import { prisma } from "@/lib/db/prisma";

/**
 * Vídeo de boas-vindas da PLATAFORMA + se o usuário logado já assistiu.
 *
 * Irmão de `welcome-video-data.ts`, que faz o mesmo para o vídeo de cada
 * setor. A diferença é onde mora a visualização: o setor usa a tabela
 * `SubsectorWelcomeView` (uma linha por pessoa por setor), a plataforma usa a
 * coluna `User.platformWelcomeWatchedAt` — porque aqui o vídeo é um só, e uma
 * tabela de junção teria cardinalidade 1.
 *
 * `pending` é o que dispara o modal obrigatório: existe vídeo publicado e este
 * usuário não tem data. Plataforma sem vídeo nunca bloqueia ninguém.
 */
export interface PlatformWelcomeVideo {
  path: string | null;
  title: string | null;
  /** true = precisa assistir agora. */
  pending: boolean;
  /** Quantas pessoas já assistiram (informativo, para quem gerencia). */
  watchedCount: number;
}

export async function getPlatformWelcomeVideo(
  userId: string | null,
): Promise<PlatformWelcomeVideo> {
  const video = await prisma.platformWelcomeVideo.findFirst({
    select: { path: true, title: true },
  });

  if (!video) {
    return { path: null, title: null, pending: false, watchedCount: 0 };
  }

  const [me, watchedCount] = await Promise.all([
    userId
      ? prisma.user.findUnique({
          where: { id: userId },
          select: { platformWelcomeWatchedAt: true },
        })
      : Promise.resolve(null),
    prisma.user.count({ where: { platformWelcomeWatchedAt: { not: null } } }),
  ]);

  return {
    path: video.path,
    title: video.title,
    // Sem usuário (tela de login) nada é pendente: não há a quem bloquear.
    pending: Boolean(userId) && !me?.platformWelcomeWatchedAt,
    watchedCount,
  };
}
