"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

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
 */
function usePortalTarget(open: boolean): HTMLElement | null {
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) {
      setTarget(null);
      return;
    }
    const resolve = () => {
      const active = document.fullscreenElement;
      setTarget(active instanceof HTMLElement ? active : document.body);
    };
    resolve();
    document.addEventListener("fullscreenchange", resolve);
    return () => document.removeEventListener("fullscreenchange", resolve);
  }, [open]);

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
  const target = usePortalTarget(open);

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
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={() => dismissible && onClose?.()}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "animate-scale-in relative z-10 w-full max-w-2xl overflow-hidden rounded-xl border border-border bg-surface shadow-2xl",
          className,
        )}
      >
        {(title || description) && (
          <div className="border-b border-border bg-surface-2/60 px-6 py-4">
            {title && <h2 className="text-base font-semibold text-foreground">{title}</h2>}
            {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
          </div>
        )}
        {children}
        {footer && <div className="border-t border-border px-6 py-4">{footer}</div>}
      </div>
    </div>,
    target,
  );
}
