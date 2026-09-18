import type { AppNotification, NotificationKind } from "@/types/notification";
import type { Role } from "@/types";

/**
 * Regras puras do sino — o que é visível para quem, e como a linha do banco
 * vira o item da tela. Sem Prisma aqui: é o que os testes unitários provam.
 */

/** A linha de `Notification`, no recorte que o sino usa. */
export interface NotificationRow {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  href: string | null;
  /** Slugs de subsetor ("*" = todos). */
  audience: readonly string[];
  targetUserId: string | null;
  createdAt: Date;
}

export interface Viewer {
  id: string;
  role: Role;
  /** Slugs dos subsetores em que o usuário está lotado. */
  slugs: readonly string[];
}

/**
 * Alvo individual é de UMA pessoa — nem o ADMIN vê a autoavaliação pendente
 * de outro. O ADMIN enxerga toda audiência de setor porque ele acessa todos
 * os setores; os demais só a dos seus subsetores, ou a geral.
 */
export function canSee(row: NotificationRow, viewer: Viewer): boolean {
  if (row.targetUserId) return row.targetUserId === viewer.id;
  if (row.audience.includes("*")) return true;
  if (viewer.role === "ADMIN") return row.audience.length > 0;
  return row.audience.some((slug) => viewer.slugs.includes(slug));
}

export function toAppNotification(row: NotificationRow, read: boolean): AppNotification {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    href: row.href ?? undefined,
    createdAt: row.createdAt.toISOString(),
    read,
  };
}

/** "agora", "há 15 min", "há 3 h", "ontem", "10/09". */
export function relativeLabel(createdAt: string, now: Date = new Date()): string {
  const diffMs = now.getTime() - new Date(createdAt).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "agora";
  if (diffMin < 60) return `há ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `há ${diffH} h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 2) return "ontem";
  const d = new Date(createdAt);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}`;
}
