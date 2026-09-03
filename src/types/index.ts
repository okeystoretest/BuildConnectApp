export type Role = "COLABORADOR" | "GESTOR" | "ADMIN";

export type Permission =
  | "content.view"
  | "content.upload"
  // Publicar/remover o VÍDEO DE BOAS-VINDAS de um setor. Separada de
  // `content.upload` de propósito: o vídeo de boas-vindas é obrigatório para
  // todo mundo do setor e trocá-lo zera as visualizações — decisão da
  // administração, não da gestão do setor.
  | "welcomeVideo.manage"
  | "links.manage"
  | "evaluations.view"
  // Preencher uma avaliação designada a si (avaliador convidado ou autoavaliação).
  // Todos os papéis têm — inclusive COLABORADOR — pois a Eficácia é 360°.
  | "evaluations.fill"
  | "sector.it"
  | "sector.hr"
  // Ler e tratar as denúncias da Central de Denúncias (DHO).
  | "reports.manage"
  | "users.manage"
  | "tickets.create"
  | "tickets.viewOwn"
  // Gestão TOTAL do chamado, incluindo a EXCLUSÃO definitiva (que apaga
  // anexos e comprovante do disco). Exclusiva do ADMIN.
  | "tickets.manage"
  // Distribuir trabalho: atribuir um chamado a OUTRA pessoa e desatribuir o
  // de terceiros. Separada de `tickets.manage` de propósito — a gestão de
  // setor precisa distribuir corrida e chamado, mas não apagar registro.
  | "tickets.assign"
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
