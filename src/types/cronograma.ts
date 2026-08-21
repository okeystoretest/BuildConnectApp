/** Domínio da ferramenta Cronograma (planejamento de conteúdo). */

export type FunnelStage = "TOFU" | "MOFU" | "BOFU";

export type ContentFormat = "REEL" | "STORY" | "FEED" | "REEL_FEED" | "CARROSSEL" | "LIVE";

export type ContentStatus = "IDEIA" | "EM_PRODUCAO" | "AGENDADO" | "PUBLICADO";

/** Marca do conteúdo. Opcional — define a cor de fundo do card. */
export type ContentBrand = "OKEY" | "LOV_CLUB";

/**
 * Alcance do post na base compartilhada.
 * - SHARED: criado no Marketing. Todo mundo vê; só o autor edita.
 * - PRIVATE: criado fora do Marketing. Só o autor vê e edita.
 */
export type ContentVisibility = "SHARED" | "PRIVATE";

export interface PostOwner {
  id: string;
  name: string;
  avatarPath?: string;
}

export interface ContentPostItem {
  id: string;
  title: string;
  /** Data local no formato yyyy-mm-dd — chave das células do calendário. */
  date: string;
  /** Horário local hh:mm. */
  time: string;
  funnel: FunnelStage;
  format: ContentFormat;
  status: ContentStatus;
  brand?: ContentBrand;
  owner: PostOwner | null;
  notes?: string;
  /** Autor do registro. */
  authorId?: string;
  /** Nome do autor, para exibição no modal de detalhes. */
  authorName?: string;
  /** Alcance do post — define o selo "Marketing" / "Somente eu" na UI. */
  visibility: ContentVisibility;
  /** Slug do subsetor onde o post nasceu (rastro de origem). */
  originSlug?: string;
  /**
   * Resolvido no servidor: verdadeiro para o autor do post (e para Admin).
   * A UI nunca decide isso sozinha — só reflete o que a action vai permitir.
   */
  canEdit: boolean;
  /** Excluir segue a mesma regra de editar: autor ou Admin. */
  canDelete: boolean;
}

/** Um ponto do gráfico de volume (um dia da semana). */
export interface FunnelVolumePoint {
  label: string;
  TOFU: number;
  MOFU: number;
  BOFU: number;
}

export interface FunnelBalanceSlice {
  stage: FunnelStage;
  count: number;
  percent: number;
}

export interface CronogramaData {
  /** Subsetor dono da base (origem, quando há herança). */
  scopeSlug: string;
  scopeLabel: string;
  /** true quando o subsetor atual está lendo a base de outro. */
  inherited: boolean;
  /**
   * true quando a aba aberta é a do Marketing: o que for criado aqui nasce
   * visível para todos. Fora dela, o post nasce privado.
   */
  authoring: ContentVisibility;
  /** Mês exibido (1–12) e ano. */
  month: number;
  year: number;
  monthLabel: string;
  /** Posts do mês que ainda não foram publicados. */
  activePosts: number;
  volume: readonly FunnelVolumePoint[];
  balance: readonly FunnelBalanceSlice[];
  posts: readonly ContentPostItem[];
  backlog: readonly ContentPostItem[];
  /** Pessoas selecionáveis como responsáveis. */
  people: readonly PostOwner[];
}
