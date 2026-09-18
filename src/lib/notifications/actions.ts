"use server";

import { getCurrentUser } from "@/lib/auth/require-user";
import type { Role } from "@/types";
import { dismissAll, markAllRead, markRead } from "./data";

/**
 * Os botões do sino. Nenhuma devolve erro para a tela: marcar como lida é
 * gesto de conforto, e uma falha aqui não merece um toast — o próximo poll
 * mostra o estado real.
 */

export async function markNotificationRead(id: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user || typeof id !== "string" || !id) return;
  try {
    await markRead(user.id, id);
  } catch (e) {
    console.error("[notificacoes] markRead:", e);
  }
}

export async function markAllNotificationsRead(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  try {
    await markAllRead(user.id, user.role as Role);
  } catch (e) {
    console.error("[notificacoes] markAllRead:", e);
  }
}

/** "Limpar notificações": some da lista deste usuário, e não volta. */
export async function dismissAllNotifications(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  try {
    await dismissAll(user.id, user.role as Role);
  } catch (e) {
    console.error("[notificacoes] dismissAll:", e);
  }
}
