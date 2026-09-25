import { prisma } from "@/lib/db/prisma";
import type { ActivityEventKind } from "@prisma/client";

/**
 * Grava um evento de atividade que não tem outra origem no banco.
 *
 * NUNCA lança. É chamado no caminho do login e do logout, e um log de
 * auditoria que impede alguém de entrar na plataforma é pior que um log com
 * buraco: a falha vai para o console, a ação segue.
 */
export async function recordActivity(userId: string, kind: ActivityEventKind): Promise<void> {
  try {
    await prisma.activityEvent.create({ data: { userId, kind } });
  } catch (error) {
    console.error(`[activity-log] falha ao gravar ${kind} de ${userId}:`, error);
  }
}
