"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Download, X } from "lucide-react";

export interface ImageLightboxProps {
  open: boolean;
  src: string;
  alt: string;
  downloadName?: string;
  onClose: () => void;
}

/** Exibe uma imagem em tela cheia, com download e fechamento por Esc. */
export function ImageLightbox({ open, src, alt, downloadName, onClose }: ImageLightboxProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-background/95 p-4">
      <div className="absolute right-4 top-4 flex gap-2">
        <a
          href={src}
          download={downloadName ?? true}
          aria-label="Baixar imagem"
          className="focus-ring flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-surface text-foreground transition-colors hover:bg-surface-2"
        >
          <Download className="h-4 w-4" />
        </a>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          className="focus-ring flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-surface text-foreground transition-colors hover:bg-surface-2"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div
        className="absolute inset-0"
        onClick={onClose}
        aria-hidden
      />

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className="animate-scale-in relative max-h-[90vh] max-w-[90vw] rounded-xl object-contain"
      />
    </div>,
    document.body,
  );
}
