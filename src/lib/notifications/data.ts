import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { AppNotification } from "@/types/notification";
import type { Role } from "@/types";
import { canSee, toAppNotification, type Viewer } from "./core";
import { subsectorSlugsOf } from "./membership";

/**
 * O sino, lido do banco por usuário.
 *
 * O recorte é feito em DUAS etapas: o `where` traz só o que PODE ser meu
 * (alvo = eu, geral, ou audiência que cruza meus slugs — o ADMIN traz toda
 * audiência de setor), e `canSee` confirma linha a linha. O `where` é o que
 * evita varrer a tabela; `canSee` é a regra provada em teste puro.
 */

/** Teto do painel. Mais que isto ninguém rola. */
const LIMIT = 50;

const ROW_SELECT = {
  id: true,
  kind: true,
  title: true,
  body: true,
  href: true,
  audience: true,
  targetUserId: true,
  createdAt: true,
} as const;

async function viewerOf(userId: string, role: Role): Promise<Viewer> {
  // O ADMIN não precisa de slugs: `canSee` libera toda audiência para ele.
  const slugs = role === "ADMIN" ? [] : await subsectorSlugsOf(userId);
  return { id: userId, role, slugs };
}

function candidateWhere(viewer: Viewer): Prisma.NotificationWhereInput {
  const audience: Prisma.NotificationWhereInput =
    viewer.role === "ADMIN"
      ? { targetUserId: null, audience: { isEmpty: false } }
      : { targetUserId: null, audience: { hasSome: ["*", ...viewer.slugs] } };
  return { OR: [{ targetUserId: viewer.id }, audience] };
}

/**
 * Ids das notificações que este usuário vê, sem as que ele limpou.
 * Reaproveitado por `markAllRead` e `dismissAll`: agir sobre "todas" é agir
 * sobre exatamente o que a lista mostra.
 */
async function visibleIds(viewer: Viewer): Promise<string[]> {
  const rows = await prisma.notification.findMany({
    where: {
      ...candidateWhere(viewer),
      reads: { none: { userId: viewer.id, dismissed: true } },
    },
    orderBy: { createdAt: "desc" },
    take: LIMIT,
    select: ROW_SELECT,
  });
  return rows.filter((r) => canSee(r, viewer)).map((r) => r.id);
}

export async function listMyNotifications(userId: string, role: Role): Promise<AppNotification[]> {
  const viewer = await viewerOf(userId, role);
  const rows = await prisma.notification.findMany({
    where: {
      ...candidateWhere(viewer),
      reads: { none: { userId, dismissed: true } },
    },
    orderBy: { createdAt: "desc" },
    take: LIMIT,
    select: {
      ...ROW_SELECT,
      reads: { where: { userId }, select: { userId: true } },
    },
  });
  return rows
    .filter((r) => canSee(r, viewer))
    .map((r) => toAppNotification(r, r.reads.length > 0));
}

/** Só grava se a notificação for visível para ele — marcar a dos outros não existe. */
export async function markRead(userId: string, notificationId: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (!user) return;
  const viewer = await viewerOf(userId, user.role as Role);
  const row = await prisma.notification.findUnique({
    where: { id: notificationId },
    select: ROW_SELECT,
  });
  if (!row || !canSee(row, viewer)) return;
  await prisma.notificationRead.upsert({
    where: { notificationId_userId: { notificationId, userId } },
    update: {},
    create: { notificationId, userId },
  });
}

async function upsertReads(userId: string, ids: string[], dismissed: boolean): Promise<void> {
  if (ids.length === 0) return;
  await prisma.$transaction(
    ids.map((notificationId) =>
      prisma.notificationRead.upsert({
        where: { notificationId_userId: { notificationId, userId } },
        update: dismissed ? { dismissed: true } : {},
        create: { notificationId, userId, dismissed },
      }),
    ),
  );
}

export async function markAllRead(userId: string, role: Role): Promise<void> {
  const viewer = await viewerOf(userId, role);
  await upsertReads(userId, await visibleIds(viewer), false);
}

/** "Limpar notificações": some da lista deste usuário, e não volta. */
export async function dismissAll(userId: string, role: Role): Promise<void> {
  const viewer = await viewerOf(userId, role);
  await upsertReads(userId, await visibleIds(viewer), true);
}
