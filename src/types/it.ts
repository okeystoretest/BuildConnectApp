export type ItTicketStatus = "PENDENTE" | "ATRIBUIDO" | "EM_ANDAMENTO" | "CONCLUIDO";

export type ItCategory =
  | "Equipamentos"
  | "Internet e Rede"
  | "Aplicativos"
  | "Acessos e Segurança";

/** Anexo enviado na abertura do chamado (foto tratada por sharp ou arquivo). */
export interface TicketAttachment {
  id: string;
  /** Caminho público servido pelo Nginx (ex.: /uploads/chamados/2026/07/x.webp). */
  url: string;
  /** Nome amigável para download. */
  name: string;
}

export interface ItTicket {
  id: string;
  code: string;
  title: string;
  category: ItCategory;
  /** Descrição integral da solicitação (exibida sem truncamento no card expandido). */
  description?: string;
  requesterName: string;
  requesterUnit: string;
  requesterSector: string;
  status: ItTicketStatus;
  openedAt: string;
  openedLabel: string;
  timeLabel: string;
  assignee?: string;
  /** Id do responsável — usado para decidir ações do ator no kanban. */
  assigneeId?: string;
  durationLabel?: string;
  /** Preenchido ao entrar em "Em andamento" — base da cronometragem. */
  startedAt?: string;
  /** Conclusão do chamado. Marca o início da janela de 30 min no quadro. */
  finishedAt?: string;
  /** Comprovante de entrega anexado na conclusão. */
  proofName?: string;
  /** URL pública real do comprovante (quando houver). */
  proofUrl?: string;
  /** Quilometragem percorrida até a conclusão. */
  distanceKm?: number;
  /** Anexos enviados na abertura (fotos/arquivos). */
  attachments?: readonly TicketAttachment[];
  /** Descrição técnica da solução (chamados de TI concluídos). */
  resolutionNote?: string;
}

export interface DistributionEntry {
  label: string;
  count: number;
  percent: number;
  color: string;
}

export interface ItDashboardData {
  total: number;
  byStatus: Record<ItTicketStatus, number>;
  avgResolution: string;
  completionRate: number;
  topUnit: string;
  topResolver: string;
  byCategory: readonly DistributionEntry[];
  byUnit: readonly DistributionEntry[];
  categoryByUnit: readonly DistributionEntry[];
}
