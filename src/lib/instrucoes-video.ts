/**
 * Layout da ferramenta Instruções em Vídeo (setores padrão e Retaguarda):
 * 3 vídeos por linha, 3 linhas por página.
 */
export const INSTRUCOES_PAGE_SIZE = 9;

const collator = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true });

/**
 * Ordem padrão da aba: alfabética pelo título (pedido de 18/09/2026).
 *
 * `sensitivity: "base"` iguala caixa e acento — "Órgãos" fica no O, não
 * depois do Z. `numeric` faz "Módulo 2" vir antes de "Módulo 10". Devolve
 * cópia: quem chama continua dono da lista original.
 */
export function sortInstrucoes<T extends { title: string }>(videos: readonly T[]): T[] {
  return [...videos].sort((a, b) => collator.compare(a.title, b.title));
}
