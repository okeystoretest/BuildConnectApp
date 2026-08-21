export type Role = "COLABORADOR" | "GESTOR" | "ADMIN";

export type Permission =
  | "content.view"
  | "content.upload"
  | "links.manage"
  | "evaluations.view"
  // Preencher uma avaliação designada a si (avaliador convidado ou autoavaliação).
  // Todos os papéis têm — inclusive COLABORADOR — pois a Eficácia é 360°.
  | "evaluations.fill"
  | "sector.it"
  | "sector.hr"
  | "users.manage"
  | "tickets.create"
  | "tickets.viewOwn"
  | "tickets.manage"
  | "tickets.claim";

export interface SectorLink {
  label: string;
  href: string;
  icon: string;
}

export interface SectorGroup {
  label: string;
  icon: string;
  items: SectorLink[];
  permission?: Permission;
}

export interface CurrentUser {
  id: string;
  name: string;
  username: string;
  role: Role;
  sector: string;
  subsector?: string;
  /** Caminho público do avatar (.webp) do usuário logado, para a sidebar. */
  avatarPath?: string;
  /**
   * Slugs de subsetor que o usuário pode acessar (RBAC de conteúdo).
   * `null` = ADMIN (acesso irrestrito, sem filtro na navegação).
   */
  accessSlugs?: string[] | null;
}
