/**
 * Filtros de Temporada, Coleção e Ano das vitrines.
 *
 * Irmão de `video-filters` (as pílulas de tag das Instruções), mas de outra
 * natureza: tag é marcação livre e combina por união — aqui são três campos de
 * cadastro e combinam por INTERSEÇÃO ("Verão" E "Cápsula 1" E "2026"), que é
 * como se procura uma peça numa vitrine.
 *
 * O ANO não é campo gravado: é o ano da data de publicação. Quem monta o item
 * (`lib/sector-data`) já entrega `ano` pronto, para esta camada não precisar
 * saber de `createdAt` nem de fuso.
 *
 * Puro, sem React — importado pela tela e pelos testes.
 */

export interface Collectible {
  temporada?: string;
  colecao?: string;
  /** Ano da publicação. Ausente só em item sem data (não acontece no banco). */
  ano?: number;
}

/** Filtro ativo. String vazia em um campo = "todas". */
export interface CollectionFilter {
  temporada: string;
  colecao: string;
  ano: string;
}

export const EMPTY_COLLECTION_FILTER: CollectionFilter = { temporada: "", colecao: "", ano: "" };

/** Há algum campo escolhido? Usado para decidir se vale mostrar "Limpar". */
export function hasCollectionFilter(filter: CollectionFilter): boolean {
  return Boolean(filter.temporada || filter.colecao || filter.ano);
}

function distinct(values: readonly (string | undefined)[]): string[] {
  // Chave em minúsculas para não listar "Verão" e "verão" como duas opções; o
  // rótulo exibido é a primeira grafia que apareceu.
  const seen = new Map<string, string>();
  for (const value of values) {
    const label = value?.trim();
    if (!label) continue;
    const key = label.toLowerCase();
    if (!seen.has(key)) seen.set(key, label);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

export interface CollectionOptions {
  temporada: string[];
  colecao: string[];
  /** Anos em ordem decrescente: a coleção atual é a que se procura. */
  ano: string[];
}

/**
 * As opções dos três seletores são o que está EM USO nos itens da aba — não um
 * cadastro à parte. Assim a lista nunca oferece uma temporada sem conteúdo, e
 * preencher o campo no envio é o que faz a opção existir.
 */
export function deriveCollectionOptions(items: readonly Collectible[]): CollectionOptions {
  return {
    temporada: distinct(items.map((i) => i.temporada)),
    colecao: distinct(items.map((i) => i.colecao)),
    ano: distinct(items.map((i) => (i.ano ? String(i.ano) : undefined))).reverse(),
  };
}

/** Campo vazio no filtro passa tudo; preenchido, exige igualdade (caixa ignorada). */
function matches(value: string | undefined, wanted: string): boolean {
  if (!wanted) return true;
  return (value ?? "").trim().toLowerCase() === wanted.trim().toLowerCase();
}

/** Interseção dos três campos. Sem nenhum escolhido, tudo passa. */
export function matchesCollection(item: Collectible, filter: CollectionFilter): boolean {
  return (
    matches(item.temporada, filter.temporada) &&
    matches(item.colecao, filter.colecao) &&
    matches(item.ano ? String(item.ano) : undefined, filter.ano)
  );
}
