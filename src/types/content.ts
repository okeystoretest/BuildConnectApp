export type TicketStatus = "ABERTO" | "EM_ANDAMENTO" | "RESOLVIDO";

/** Uma linha da linha do tempo do chamado (ver `lib/tickets/timeline`). */
export interface TicketTimelineEntry {
  key: string;
  /** O fato: "Chamado aberto", "Atribuído a Ana Souza"… */
  label: string;
  /** Quem executou, quando acrescenta algo ao rótulo. */
  by?: string;
  /** "04/11/2026 às 14:32" — data E hora, no calendário de Brasília. */
  atLabel: string;
}

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
  /** Andamento completo. Só o histórico carrega: o quadro não precisa. */
  timeline?: TicketTimelineEntry[];
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
