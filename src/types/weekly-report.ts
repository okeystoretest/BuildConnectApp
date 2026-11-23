/** Domínio da ferramenta Relatório Semanal, do lado da tela. */

/** 🟢 No ritmo · 🟡 Atenção · 🔴 Travado. */
export type WeeklyHealth = "NO_RITMO" | "ATENCAO" | "TRAVADO";

export type MarketingTaskStatus =
  | "BACKLOG"
  | "A_FAZER"
  | "EM_ANDAMENTO"
  | "REVISAO"
  | "PUBLICADO";

export type MarketingTaskCategory =
  | "CONTEUDO"
  | "PUBLICACAO"
  | "COMUNIDADE"
  | "RELATORIO"
  | "PROCESSO";

export type MarketingTaskPriority = "ALTA" | "MEDIA" | "BAIXA";

export interface DeliveryItem {
  id: string;
  order: number;
  day: string;
  block: string;
  expected: string;
  health?: WeeklyHealth;
  evidence?: string;
  note?: string;
}

export interface MetricItem {
  id: string;
  order: number;
  channel: string;
  metric: string;
  previous?: number;
  current?: number;
  target?: string;
  health?: WeeklyHealth;
  reading?: string;
}

export interface OkrItem {
  id: string;
  order: number;
  objective: string;
  keyResult: string;
  measure: string;
  goalLabel: string;
  goalValue?: number;
  achieved?: number;
  /** KR de leitura MENSAL: decide-se pela média de 4 semanas. */
  monthlyRead: boolean;
  health?: WeeklyHealth;
  nextStep?: string;
  /**
   * Média do realizado nas últimas 4 semanas (esta inclusive), calculada
   * sobre os relatórios anteriores. É o número da decisão nos KRs de leitura
   * mensal; ausente enquanto nenhuma semana foi apurada.
   */
  fourWeekAverage?: number;
}

export interface BlockerItem {
  id: string;
  order: number;
  title: string;
  impact?: string;
  needs?: string;
  /** yyyy-mm-dd. */
  dueDate?: string;
  health?: WeeklyHealth;
  resolution?: string;
}

export interface AgendaItem {
  id: string;
  order: number;
  block: string;
  minutes: number;
  question: string;
  answer?: string;
}

/** O card da lista: o bastante para escolher qual semana abrir. */
export interface WeeklyReportListItem {
  id: string;
  weekNumber: number;
  /** yyyy-mm-dd. */
  periodStart: string;
  periodEnd: string;
  authorName?: string;
  /** Contadores das entregas, calculados no servidor. */
  onTrack: number;
  attention: number;
  blocked: number;
  /** Entregas sem status: o que ainda falta responder. */
  pending: number;
}

export interface WeeklyReportDetail extends WeeklyReportListItem {
  highlight?: string;
  learning?: string;
  nextPriority?: string;
  deliveries: readonly DeliveryItem[];
  metrics: readonly MetricItem[];
  okrs: readonly OkrItem[];
  blockers: readonly BlockerItem[];
  agenda: readonly AgendaItem[];
  /** Resolvido no servidor: a tela só reflete o que a action vai permitir. */
  canEdit: boolean;
  canApprove: boolean;
}

/** Quem toca o cartão — a mesma forma do `PostOwner` do Cronograma. */
export interface TaskPerson {
  id: string;
  name: string;
  /** Caminho público da foto já tratada. Ausente = iniciais. */
  avatarPath?: string;
}

export interface MarketingTaskItem {
  id: string;
  code: string;
  title: string;
  category: MarketingTaskCategory;
  priority: MarketingTaskPriority;
  assignee?: TaskPerson;
  /** yyyy-mm-dd. */
  enteredAt: string;
  dueDate?: string;
  status: MarketingTaskStatus;
  evidence?: string;
  note?: string;
  doneAt?: string;
  /** Prazo vencido e ainda não publicado — a conta do painel, por cartão. */
  overdue: boolean;
}

/** A aba 8 da planilha: só contagem, nenhuma coluna nova no banco. */
export interface KanbanSummary {
  total: number;
  published: number;
  overdue: number;
  byStatus: readonly { status: MarketingTaskStatus; count: number; share: number }[];
  byCategory: readonly {
    category: MarketingTaskCategory;
    counts: Readonly<Record<MarketingTaskStatus, number>>;
    total: number;
  }[];
}

export interface WeeklyReportData {
  slug: string;
  sectorLabel: string;
  canEdit: boolean;
  canApprove: boolean;
  reports: readonly WeeklyReportListItem[];
  tasks: readonly MarketingTaskItem[];
  summary: KanbanSummary;
  /** Quem pode ser responsável por um cartão: a gente do subsetor. */
  people: readonly TaskPerson[];
}
