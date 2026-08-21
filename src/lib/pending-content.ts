export type PendingKind = "VIDEO" | "DOCUMENTO";

export interface PendingItem {
  id: string;
  kind: PendingKind;
  title: string;
  sector: string;
  /** Duração para vídeos, tamanho para documentos. */
  meta: string;
}

export interface PendingCategory {
  category: string;
  items: readonly PendingItem[];
}
