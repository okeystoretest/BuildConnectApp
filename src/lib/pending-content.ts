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

/** Rótulo do grupo dos vídeos reprovados, sempre no topo da lista. */
export const REDO_GROUP = "Refazer";

/** Quantas pendências cabem numa página de "Meu Progresso". */
export const PENDING_PAGE_SIZE = 10;

/** Um item já posicionado na lista única, sabendo a que grupo pertence. */
export interface PendingRow {
  item: PendingItem;
  /** Rótulo do grupo — vira separador quando muda de uma linha para a outra. */
  group: string;
}

/**
 * As pendências viram UMA lista, na ordem em que a tela mostra: primeiro os
 * vídeos a refazer (de todos os setores), depois cada categoria na ordem em
 * que veio.
 *
 * Achatar é o que torna a paginação honesta. Paginando grupo a grupo, uma
 * categoria de dois itens gastaria uma página inteira e a pessoa passaria
 * seis páginas para ver quarenta pendências.
 *
 * O rótulo viaja junto de CADA item, e não só do primeiro, porque o separador
 * é decidido dentro da página: quem abre a página 3 no meio de "Retaguarda"
 * precisa saber de qual grupo são aqueles itens.
 */
export function flattenPending(groups: readonly PendingCategory[]): PendingRow[] {
  const redo: PendingRow[] = [];
  const rest: PendingRow[] = [];
  for (const group of groups) {
    for (const item of group.items) {
      if (item.rejections > 0) redo.push({ item, group: REDO_GROUP });
      else rest.push({ item, group: group.category });
    }
  }
  return [...redo, ...rest];
}
