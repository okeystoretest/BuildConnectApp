export interface Page<T> {
  items: readonly T[];
  /** Página efetiva (1-based), já puxada para dentro do intervalo válido. */
  page: number;
  pages: number;
  /** Posição do primeiro e do último item da página, 1-based; 0 se vazia. */
  from: number;
  to: number;
  total: number;
}

/**
 * Paginação no cliente sobre uma lista já carregada.
 *
 * A página pedida é sempre puxada para dentro do intervalo: quem está na
 * página 4 e digita uma busca que deixa só 12 resultados cai na 2, e não numa
 * página vazia. Lista vazia é UMA página vazia — o rodapé sempre tem o que
 * mostrar.
 */
export function paginate<T>(items: readonly T[], page: number, size: number): Page<T> {
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / size));
  const current = Math.min(Math.max(1, Math.floor(page)), pages);
  const start = (current - 1) * size;
  const slice = items.slice(start, start + size);
  return {
    items: slice,
    page: current,
    pages,
    from: slice.length === 0 ? 0 : start + 1,
    to: start + slice.length,
    total,
  };
}
