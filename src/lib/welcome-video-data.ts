import { prisma } from "@/lib/db/prisma";

/**
 * Vídeo de boas-vindas de um setor + se o usuário logado já assistiu.
 *
 * `pending` é o que dispara o modal obrigatório: existe vídeo configurado e
 * não existe registro de visualização para este usuário. Um setor sem vídeo
 * nunca bloqueia ninguém.
 */
export interface SectorWelcomeVideo {
  subsectorSlug: string;
  subsectorLabel: string;
  path: string | null;
  title: string | null;
  /** true = precisa assistir agora. */
  pending: boolean;
  /** Quantos usuários já assistiram (informativo, para quem gerencia). */
  watchedCount: number;
}

export async function getSectorWelcomeVideo(
  subsectorSlug: string,
  userId: string,
): Promise<SectorWelcomeVideo | null> {
  const sub = await prisma.subsector.findUnique({
    where: { slug: subsectorSlug },
    select: {
      id: true,
      slug: true,
      label: true,
      welcomeVideoPath: true,
      welcomeVideoTitle: true,
      _count: { select: { welcomeViews: true } },
    },
  });
  if (!sub) return null;

  let watched = false;
  if (sub.welcomeVideoPath) {
    const view = await prisma.subsectorWelcomeView.findUnique({
      where: { userId_subsectorId: { userId, subsectorId: sub.id } },
      select: { id: true },
    });
    watched = Boolean(view);
  }

  return {
    subsectorSlug: sub.slug,
    subsectorLabel: sub.label,
    path: sub.welcomeVideoPath,
    title: sub.welcomeVideoTitle,
    pending: Boolean(sub.welcomeVideoPath) && !watched,
    watchedCount: sub._count.welcomeViews,
  };
}
