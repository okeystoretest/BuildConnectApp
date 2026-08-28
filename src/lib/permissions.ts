import type { Permission, Role } from "@/types";

/**
 * Matriz única de permissões da plataforma.
 * Qualquer condicional de UI deve derivar daqui — nunca comparar Role direto no componente.
 */
const MATRIX: Record<Role, readonly Permission[]> = {
  COLABORADOR: [
    "content.view",
    "evaluations.fill",
    "tickets.create",
    "tickets.viewOwn",
    "tickets.claim",
  ],
  GESTOR: [
    "content.view",
    "content.upload",
    "links.manage",
    "evaluations.view",
    "evaluations.fill",
    "tickets.create",
    "tickets.viewOwn",
    "tickets.claim",
  ],
  ADMIN: [
    "content.view",
    "content.upload",
    "welcomeVideo.manage",
    "links.manage",
    "evaluations.view",
    "evaluations.fill",
    "sector.it",
    "sector.hr",
    "reports.manage",
    "users.manage",
    "tickets.create",
    "tickets.viewOwn",
    "tickets.manage",
    "tickets.claim",
  ],
} as const;

export function can(role: Role, permission: Permission): boolean {
  return MATRIX[role].includes(permission);
}

export function canAny(role: Role, permissions: readonly Permission[]): boolean {
  return permissions.some((p) => can(role, p));
}

export const ROLE_LABEL: Record<Role, string> = {
  COLABORADOR: "Colaborador(a)",
  GESTOR: "Gestor(a)",
  ADMIN: "Admin",
};

export const ROLE_ORDER: readonly Role[] = ["COLABORADOR", "GESTOR", "ADMIN"];
