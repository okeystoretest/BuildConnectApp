"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Tela cheia de verdade para uma ferramenta da página.
 *
 * Duas camadas, e as duas são necessárias: o overlay em portal garante que o
 * conteúdo ocupe a janela inteira (imune a qualquer ancestral com `transform`,
 * que quebraria `position: fixed`), e a Fullscreen API do navegador some
 * também com a barra de endereço e as abas. Negada a API, o overlay sozinho já
 * entrega a visualização ampliada.
 *
 * Mora aqui, e não dentro de um painel, porque o Cronograma e o Departamento
 * Pessoal precisam do MESMO comportamento — inclusive do ESC e da trava de
 * rolagem do corpo, que são fáceis de esquecer numa segunda cópia.
 */
export function useFullscreen() {
  const [on, setOn] = useState(false);
  /** O portal só existe depois da hidratação: no servidor não há `document`. */
  const [mounted, setMounted] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!on) return;

    const node = ref.current;
    if (node && !document.fullscreenElement) {
      void node.requestFullscreen?.().catch(() => {
        /* sem permissão ou sem suporte: o overlay basta */
      });
    }

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOn(false);
    }
    // ESC nativo sai do fullscreen do navegador; o overlay tem de acompanhar.
    function onFullscreenChange() {
      if (!document.fullscreenElement) setOn(false);
    }

    document.addEventListener("keydown", onKey);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.body.style.overflow = previous;
      if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => {});
    };
  }, [on]);

  return { on, setOn, mounted, ref };
}
