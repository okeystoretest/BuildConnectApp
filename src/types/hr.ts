import type { Role } from "@/types";

export interface ContentBreakdown {
  label: string;
  done: number;
  total: number;
  icon: string;
  tone: "primary" | "info" | "accent";
}

/** Item de pendência individual, para o detalhamento por tipo de mídia. */
export interface PendingItem {
  id: string;
  title: string;
}

/** Grupo de pendências de um mesmo tipo de mídia (vídeos, documentos, instruções). */
export interface PendingGroup {
  label: string;
  icon: string;
  tone: "primary" | "info" | "accent";
  items: readonly PendingItem[];
}

/** Item enxuto do seletor de colaboradores. */
export interface EmployeeSummary {
  id: string;
  name: string;
  username: string;
  role: string;
  sector: string;
}

export interface EmployeeHistory {
  id: string;
  name: string;
  role: string;
  sector: string;
  overallPercent: number;
  doneItems: number;
  totalItems: number;
  breakdown: readonly ContentBreakdown[];
  /** Indicadores de engajamento (assistidos/lidos). */
  videosWatched: number;
  documentsRead: number;
  /** Feedbacks recebidos — estrutura preparada para funcionalidade futura. */
  feedbacksReceived: number;
  pendingItems: number;
  /** Pendências detalhadas, agrupadas por tipo de mídia. */
  pendingGroups: readonly PendingGroup[];
}

export interface EvaluationType {
  id: string;
  title: string;
  count: number;
}

export type IntegrationMapStatus = "CONCLUIDO" | "EM_ANDAMENTO";

export interface IntegrationMap {
  id: string;
  title: string;
  scope: string;
  progress: number;
  status: IntegrationMapStatus;
  /** Caminho do PDF do mapa, quando enviado. */
  filePath?: string;
}

export interface HrDocument {
  id: string;
  name: string;
  size: string;
  kind: "PDF" | "DOCX" | "XLSX";
  /** Caminho do arquivo real para visualizar/baixar. */
  filePath?: string;
}

export interface ManagedUser {
  id: string;
  name: string;
  username: string;
  role: Role;
  sector: string;
  subsectors: string;
  /** Caminho público do avatar (.webp) para exibição na lista. */
  avatarPath?: string;
}
