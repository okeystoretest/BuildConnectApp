import { prisma } from "@/lib/db/prisma";
import type { Role } from "@/types";

/**
 * Lotação, nos dois sentidos, com a MESMA regra de `resolveAccessibleSlugs`
 * (lib/auth/access.ts): subsetores marcados no cadastro valem; sem marcação,
 * o usuário está em todos os subsetores do seu setor.
 *
 * Duplicado aqui, e não importado de lá, porque `access.ts` usa `cache` do
 * React e não carrega fora do Next — e estes dois precisam rodar nos testes
 * de banco e no cron.
 */

export async function subsectorSlugsOf(userId: string): Promise<string[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      sectorId: true,
      subsectors: { select: { subsector: { select: { slug: true } } } },
    },
  });
  if (!user) return [];
  const explicit = user.subsectors.map((s) => s.subsector.slug);
  if (explicit.length > 0) return explicit;
  if (!user.sectorId) return [];
  const all = await prisma.subsector.findMany({
    where: { sectorId: user.sectorId },
    select: { slug: true },
  });
  return all.map((s) => s.slug);
}

/** Ids dos usuários ATIVOS lotados no subsetor. */
export async function activeUserIdsInSubsector(slug: string): Promise<string[]> {
  const sub = await prisma.subsector.findUnique({ where: { slug }, select: { sectorId: true } });
  if (!sub) return [];
  const users = await prisma.user.findMany({
    where: {
      active: true,
      OR: [
        { subsectors: { some: { subsector: { slug } } } },
        { subsectors: { none: {} }, sectorId: sub.sectorId },
      ],
    },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

/**
 * A EQUIPE ativa do setor, com o papel de cada um — a lotação inteira, em
 * todos os subsetores dele.
 *
 * Recorte mais largo que `activeUserIdsInSubsector` de propósito: a chegada de
 * um colega é notícia do setor, não de um subsetor. Aqui não há a regra de
 * "sem marcação, vale o setor todo" porque o setor JÁ é a unidade consultada.
 *
 * Traz o papel porque quem chama precisa dele: a notificação de integração
 * manda na hora para o GESTOR e pela fila para o resto. Uma consulta só, para
 * os dois canais não discordarem sobre quem é a equipe.
 */
export async function activeMembersOfSector(
  sectorId: string | null,
): Promise<{ id: string; role: Role }[]> {
  if (!sectorId) return [];
  return prisma.user.findMany({
    where: { active: true, sectorId },
    select: { id: true, role: true },
  });
}

/** Só os ids de `activeMembersOfSector`, para quem não precisa do papel. */
export async function activeUserIdsInSector(sectorId: string | null): Promise<string[]> {
  const members = await activeMembersOfSector(sectorId);
  return members.map((m) => m.id);
}
