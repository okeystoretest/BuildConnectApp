/**
 * Filtros da aba de vídeos.
 *
 * As pílulas não são cadastradas à parte: são a união das tags atribuídas na
 * edição de cada vídeo. Assim o que aparece na barra é sempre o que está em
 * uso, e atribuir uma tag a um vídeo é o que faz a pílula existir.
 *
 * Puro, sem React — importado pela tela e pelos testes.
 */

export interface Tagged {
  tags?: readonly string[];
}

/** União das tags, sem repetição (caixa ignorada), em ordem alfabética. */
export function deriveFilters(items: readonly Tagged[]): string[] {
  const seen = new Map<string, string>();
  for (const item of items) {
    for (const tag of item.tags ?? []) {
      const key = tag.toLowerCase();
      if (!seen.has(key)) seen.set(key, tag);
    }
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

/** Sem filtro ativo, tudo passa; com filtros, basta uma tag em comum. */
export function matchesFilters(item: Tagged, active: readonly string[]): boolean {
  if (active.length === 0) return true;
  const tags = new Set((item.tags ?? []).map((t) => t.toLowerCase()));
  return active.some((filter) => tags.has(filter.toLowerCase()));
}
