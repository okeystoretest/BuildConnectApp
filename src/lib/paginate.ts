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

/** Quantos vizinhos de cada lado da página atual a faixa mostra. */
const SPAN = 1;

/** Acima disto a faixa recorta; até aqui cabem todos os números. */
const MAX_SLOTS = 7;

/**
 * Os números a desenhar na faixa de paginação, com `"gap"` onde a sequência
 * salta.
 *
 * Existe porque desenhar uma página por número não escala: 366 pendências dão
 * 37 botões, que estouram a linha e empurram a seta de "próxima" para fora da
 * tela. A faixa fica com as duas pontas sempre visíveis (a 1 e a última são os
 * destinos mais pedidos) e uma janela em volta da atual.
 *
 * A largura é FIXA em `MAX_SLOTS`: perto das pontas a janela é empurrada para
 * dentro em vez de encolher, senão a faixa mudaria de tamanho a cada clique e
 * os botões fugiriam do cursor.
 */
export function pageWindow(current: number, pages: number): (number | "gap")[] {
  if (pages <= MAX_SLOTS) {
    return Array.from({ length: pages }, (_, i) => i + 1);
  }

  let start = Math.max(2, current - SPAN);
  let end = Math.min(pages - 1, current + SPAN);

  // Encostou numa ponta: a janela cresce para o outro lado e a largura se
  // mantém. Perto do início a fileira é [1 … n, gap, última], então sobram
  // MAX_SLOTS-2 números antes da lacuna; perto do fim é [1, gap, n … última],
  // e a lacuna come mais uma casa.
  if (current - SPAN <= 2) end = Math.min(pages - 1, MAX_SLOTS - 2);
  if (current + SPAN >= pages - 1) start = Math.max(2, pages - (MAX_SLOTS - 3));

  const out: (number | "gap")[] = [1];
  if (start > 2) out.push("gap");
  for (let n = start; n <= end; n += 1) out.push(n);
  if (end < pages - 1) out.push("gap");
  out.push(pages);
  return out;
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
