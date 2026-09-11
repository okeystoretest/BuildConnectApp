export type Role = "COLABORADOR" | "GESTOR" | "ADMIN";

export type Permission =
  | "content.view"
  | "content.upload"
  // Publicar/remover o VÍDEO DE BOAS-VINDAS de um setor. Separada de
  // `content.upload` de propósito: o vídeo de boas-vindas é obrigatório para
  // todo mundo do setor — decisão da administração, não da gestão do setor.
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
  | "tickets.claim"
  // Criar, publicar e ler os resultados dos formulários do DHO. GESTOR e ADMIN.
  // O recorte por setor NÃO mora aqui: a matriz é por papel, e quem recorta é
  // a cláusula de consulta (ver formScopeFor em lib/forms/rules).
  | "forms.manage"
  // Configurar a integração com o Gemini: chave da API, modelo e instruções
  // do sistema, na aba "Inteligência Artificial" da Retaguarda. Só ADMIN —
  // é a tela onde uma credencial paga é colada.
  | "ai.manage";

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
  /**
   * Setor que só quem é dele alcança, em qualquer papel — nem permissão nem
   * hierarquia abrem a porta. Hoje é o DHO. O ADMIN continua entrando, como em
   * todo o resto do sistema.
   *
   * É uma marca própria, e não uma `permission`, porque a pergunta é de
   * LOTAÇÃO ("você é do DHO?") e não de papel ("você sabe ver avaliações?").
   */
  dhoOnly?: boolean;
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
  /**
   * O usuário alcança as ferramentas do DHO (avaliações, formulários, gestão
   * de usuários, denúncias)? Verdadeiro para quem é do DHO e para o ADMIN.
   *
   * Vem resolvido do servidor a cada requisição, e não do cookie: mudar alguém
   * de setor não invalida a sessão, então um valor gravado no token
   * continuaria afirmando a lotação antiga. É o que decide se o DHO aparece na
   * barra lateral — a página e as actions conferem por conta própria.
   */
  dhoMember?: boolean;
}
