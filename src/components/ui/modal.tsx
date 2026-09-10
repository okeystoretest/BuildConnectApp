"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { resolvePortalTarget } from "@/lib/portal-target";

export interface ModalProps {
  open: boolean;
  onClose?: () => void;
  title?: string;
  description?: string;
  dismissible?: boolean;
  className?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

/**
 * Alvo do portal.
 *
 * Normalmente `document.body`. Mas quando alguma tela está em FULLSCREEN
 * nativo (dashboards e calendário), o navegador só pinta a subárvore do
 * elemento em tela cheia — um modal ancorado no body existiria no DOM e
 * ficaria invisível. Por isso o alvo acompanha `document.fullscreenElement`,
 * reavaliado a cada `fullscreenchange`.
 *
 * A exceção mora em `resolvePortalTarget`: quando quem está em tela cheia é um
 * elemento DE DENTRO do próprio modal (o player dos vídeos de boas-vindas), o
 * portal fica onde está. Segui-lo arrancaria o modal do documento e derrubaria
 * o fullscreen no mesmo instante.
 */
function usePortalTarget(
  open: boolean,
  rootRef: React.RefObject<HTMLDivElement | null>,
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

export function Modal({
  open,
  onClose,
  title,
  description,
  dismissible = true,
  className,
  children,
  footer,
}: ModalProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const target = usePortalTarget(open, rootRef);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && dismissible) onClose?.();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, dismissible, onClose]);

  if (!open || !target) return null;

  return createPortal(
    // z-[60] fica acima do calendário/dashboard em tela cheia (z-50) — a ordem
    // de empilhamento é explícita, não dependente da ordem no DOM.
    <div ref={rootRef} className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={() => dismissible && onClose?.()}
        aria-hidden
      />
      {/* O teto de altura e a rolagem interna moram AQUI, e não em cada modal.
          Sem `max-h`, um formulário mais alto que a janela não ganha barra: ele
          simplesmente sai da tela, e os campos de baixo ficam inalcançáveis.
          `dvh` e não `vh` porque no celular a barra de endereço entra e sai, e
          `vh` mede a janela sem ela — o rodapé, onde fica o botão de salvar,
          acabaria escondido sob o navegador. */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "animate-scale-in relative z-10 flex max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-2xl",
          className,
        )}
      >
        {(title || description) && (
          <div className="shrink-0 border-b border-border bg-surface-2/60 px-6 py-4">
            {title && <h2 className="text-base font-semibold text-foreground">{title}</h2>}
            {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
          </div>
        )}
        {/* `min-h-0` é obrigatório: sem ele um filho flex recusa encolher
            abaixo do próprio conteúdo, e a rolagem nunca chega a aparecer. */}
        <div className="scrollbar-slim min-h-0 flex-1 overflow-y-auto">{children}</div>
        {footer && (
          <div className="shrink-0 border-t border-border px-6 py-4">{footer}</div>
        )}
      </div>
    </div>,
    target,
  );
}
