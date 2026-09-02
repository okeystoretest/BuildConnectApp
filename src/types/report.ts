/** Domínio da Central de Denúncias (canal anônimo + tratativa no DHO). */

export type ReportStatus = "ABERTA" | "EM_ANALISE" | "ENCERRADA";

/** Evidência anexada pelo denunciante (imagem já tratada, .webp). */
export interface ReportAttachmentItem {
  id: string;
  /** Caminho público servido pela rota /uploads. */
  url: string;
  name: string;
}

export interface ReportItem {
  id: string;
  /** Código exibido (DEN-001). */
  code: string;
  status: ReportStatus;
  /** Nome do colaborador a quem a denúncia se destina. */
  targetName: string;
  description: string;
  /** Tratativa registrada pelo DHO. */
  handlingNote?: string;
  createdAt: string;
  createdLabel: string;
  timeLabel: string;
  /** Encerramento — início da janela de 30 min antes do arquivamento. */
  closedAt?: string;
  attachments: readonly ReportAttachmentItem[];
}

/** Quantidade máxima de evidências por denúncia. */
export const MAX_REPORT_ATTACHMENTS = 5;

/** Mínimo de caracteres para a busca de destinatário devolver resultados. */
export const REPORT_TARGET_MIN_QUERY = 4;

export const REPORT_STATUS_ORDER: readonly ReportStatus[] = [
  "ABERTA",
  "EM_ANALISE",
  "ENCERRADA",
];

export const REPORT_STATUS_LABEL: Record<ReportStatus, string> = {
  ABERTA: "Aberta",
  EM_ANALISE: "Em análise",
  ENCERRADA: "Encerrada",
};

export const REPORT_STATUS_DOT: Record<ReportStatus, string> = {
  ABERTA: "bg-warning",
  EM_ANALISE: "bg-accent",
  ENCERRADA: "bg-primary",
};

export const REPORT_STATUS_TONE: Record<ReportStatus, "warning" | "accent" | "primary"> = {
  ABERTA: "warning",
  EM_ANALISE: "accent",
  ENCERRADA: "primary",
};
