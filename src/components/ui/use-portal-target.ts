"use client";

import { useEffect, useState } from "react";
import { resolvePortalTarget } from "@/lib/portal-target";

/**
 * Onde ancorar um overlay que usa `position: fixed`.
 *
 * Todo overlay do projeto PRECISA ir por portal, e não é preferência: os
 * painéis de aba levam `animate-tab-in`, cuja animação usa
 * `animation-fill-mode: both`. O `transform: translateY(0)` do último quadro
 * PERMANECE no elemento, e um ancestral com `transform` vira bloco contentor —
 * `position: fixed` passa a medir contra ele em vez da janela. Um modal
 * renderizado ali dentro abre preso à caixa da aba, cortado e com barra de
 * rolagem própria.
 *
 * O alvo é o `document.body`, exceto quando algo está em tela cheia: aí o
 * navegador só pinta a subárvore do elemento em fullscreen, e um overlay no
 * body existiria no DOM sem aparecer. A exceção da exceção mora em
 * `lib/portal-target`, que é onde a decisão está testada.
 *
 * `rootRef` é a raiz que o próprio overlay renderiza — é ela que permite
 * distinguir "o calendário está em tela cheia" de "quem está em tela cheia é
 * um filho meu".
 */
export function usePortalTarget(
  open: boolean,
  rootRef: React.RefObject<HTMLElement | null>,
): HTMLElement | null {
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) {
      setTarget(null);
      return;
    }
    const resolve = () => {
      const active = document.fullscreenElement;
      setTarget(
        resolvePortalTarget(
          active instanceof HTMLElement ? active : null,
          rootRef.current,
          document.body,
        ),
      );
    };
    resolve();
    document.addEventListener("fullscreenchange", resolve);
    return () => document.removeEventListener("fullscreenchange", resolve);
  }, [open, rootRef]);

  return target;
}
