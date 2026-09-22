export type PendingKind = "VIDEO" | "DOCUMENTO";

export interface PendingItem {
  id: string;
  kind: PendingKind;
  title: string;
  sector: string;
  /** Duração para vídeos, tamanho para documentos. */
  meta: string;
  /** Slug do subsetor dono — leva à tela de origem do conteúdo. */
  subsectorSlug: string;
  /** Caminho público do arquivo: o item é executado a partir desta tela. */
  filePath?: string;
  thumbnailPath?: string;
  transcriptText?: string;
  /** Vídeo: chegou ao fim, a pergunta de compreensão está liberada. */
  ended?: boolean;
  /** Quantas tentativas deste vídeo foram reprovadas (nota < 7). */
  rejections: number;
}

export interface PendingCategory {
  category: string;
  items: readonly PendingItem[];
}
