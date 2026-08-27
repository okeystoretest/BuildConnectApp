import type { AppNotification } from "@/types/notification";

/**
 * Estado inicial do sino.
 *
 * Vazio de propósito: as notificações de demonstração que moravam aqui foram
 * removidas junto com a higienização do banco. O sino é hoje um estado de
 * sessão (ver `src/providers/notification-provider.tsx`) — nada é lido da
 * tabela `Notification`, então qualquer item fixo aqui reapareceria a cada
 * recarga, mesmo com o banco zerado.
 */
export const INITIAL_NOTIFICATIONS: readonly AppNotification[] = [];
