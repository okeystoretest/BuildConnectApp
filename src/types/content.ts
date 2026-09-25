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
  /** Chamado de Motoristas ainda não chegou ao Build.Flow (reenvio automático). */
  flowSyncHint?: string;
  /** Comprovante de entrega (rota autenticada do Connect que busca no Flow). */
  proofUrl?: string;
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
