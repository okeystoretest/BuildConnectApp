"use client";

import { useLayoutEffect, useRef, useState } from "react";

/**
 * Limita uma coluna de kanban a N cards à vista; do seguinte em diante, rola.
 *
 * O limite NÃO é um número fixo de pixels porque a altura do card varia —
 * título que quebra linha, anexos, selos, contagem regressiva. A lista mede a
 * base do N-ésimo card e fixa a altura máxima ali. Com N ou menos cards, sem
 * limite nenhum. Remede quando os cards mudam de tamanho: texto, largura da
 * coluna, sidebar recolhida.
 *
 * Extraído de `it/kanban-column.tsx` quando o quadro da Página de Integração
 * passou a precisar do mesmo comportamento. É medição com `ResizeObserver`,
 * não duas linhas de CSS: duplicar isso é garantir que uma das cópias
 * envelheça sozinha.
 *
 * CONTRATO: conta os filhos diretos que SÃO card — `<article>` no quadro de
 * chamados, `<li>` no da integração. É o que deixa de fora o placeholder de
 * coluna vazia, que é um `<p>`.
 */
export function useCardListLimit<T extends HTMLElement = HTMLDivElement>(
  visible: number,
  count: number,
) {
  const ref = useRef<T | null>(null);
  const [maxHeight, setMaxHeight] = useState<number | undefined>(undefined);

  useLayoutEffect(() => {
    const list = ref.current;
    if (!list) return;

    const measure = () => {
      const cards = Array.from(list.children).filter(
        (el): el is HTMLElement =>
          el instanceof HTMLElement && (el.tagName === "ARTICLE" || el.tagName === "LI"),
      );
      if (cards.length <= visible) {
        setMaxHeight(undefined);
        return;
      }
      const first = cards[0]!;
      const last = cards[visible - 1]!;
      setMaxHeight(last.offsetTop + last.offsetHeight - first.offsetTop);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    for (const child of Array.from(list.children)) observer.observe(child);
    return () => observer.disconnect();
  }, [visible, count]);

  return { ref, maxHeight };
}
