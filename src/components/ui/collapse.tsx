"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface CollapseProps {
  open: boolean;
  /** Duração da transição em ms. Deve casar com a classe de duração usada. */
  durationMs?: number;
  className?: string;
  children: React.ReactNode;
}

/**
 * Abertura/fechamento animado com altura desconhecida.
 *
 * Usa a técnica de `grid-template-rows: 0fr -> 1fr`: o navegador interpola a
 * altura da linha sem que precisemos medir o conteúdo com JS (nada de
 * `scrollHeight`, nada de ResizeObserver). O filho direto tem `overflow-hidden`
 * para recortar durante a animação.
 *
 * Enquanto fechado, o conteúdo é removido da árvore de acessibilidade e do
 * foco (`visibility: hidden`), mas só DEPOIS que a animação de fechamento
 * termina — do contrário o fechamento seria instantâneo.
 */
export function Collapse({ open, durationMs = 280, className, children }: CollapseProps) {
  const [mountedHidden, setMountedHidden] = useState(!open);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);

    if (open) {
      setMountedHidden(false);
      return;
    }
    timer.current = setTimeout(() => setMountedHidden(true), durationMs);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [open, durationMs]);

  return (
    <div
      className={cn(
        "grid transition-[grid-template-rows,opacity] ease-smooth motion-reduce:transition-none",
        open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        className,
      )}
      style={{ transitionDuration: `${durationMs}ms` }}
      aria-hidden={!open}
    >
      <div className={cn("overflow-hidden", mountedHidden && "invisible")}>{children}</div>
    </div>
  );
}
