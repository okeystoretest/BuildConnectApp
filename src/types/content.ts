export type TicketStatus = "ABERTO" | "EM_ANDAMENTO" | "RESOLVIDO";

export interface Ticket {
  id: string;
  code: string;
  title: string;
  sector: string;
  status: TicketStatus;
  openedLabel: string;
  /** Quem abriu/atribuiu a solicitação. */
  requestedBy?: string;
  /** Técnico responsável pela resolução. */
  assignee?: string;
  category?: string;
}

export interface AreaProgress {
  area: string;
  videos: number;
  documents: number;
}

export interface SectorProgress {
  sector: string;
  icon: string;
  areas: readonly AreaProgress[];
}

export interface CompanyValue {
  title: string;
  body: string;
  icon: string;
}

export interface ProgressSummary {
  overall: number;
  mappedAreas: number;
  pendingItems: number;
}
