"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

/**
 * Visualizador de documento pessoal, dentro da plataforma.
 *
 * O que ele mostra NÃO é o arquivo: é a página rasterizada no servidor com
 * marca d'água do nome de quem está olhando (ver `/api/documentos-pessoais`).
 * Por isso não há botão de baixar aqui — o original nunca passa por este
 * componente, e oferecer download seria oferecer a fotografia.
 *
 * A imagem chega por `fetch`, e não num `<img src>`: a resposta traz o total
 * de páginas num cabeçalho, que só se lê assim. O `blob:` resultante morre com
 * o modal, em vez de ficar num endereço que se copia para outra aba.
 */

export interface PersonnelDocumentViewerProps {
  /** `null` fecha. É o id do arquivo, não o caminho dele. */
  file: { id: string; name: string } | null;
  onClose: () => void;
}

export function PersonnelDocumentViewer({ file, onClose }: PersonnelDocumentViewerProps) {
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Documento novo recomeça na primeira página; sem isto, abrir um ASO de uma
  // página depois de um de cinco tentaria a página 5.
  useEffect(() => {
    setPage(1);
    setPages(1);
    setError(null);
  }, [file?.id]);

  useEffect(() => {
    if (!file) return;
    let url: string | null = null;
    let cancelled = false;

    void (async () => {
      setSrc(null);
      setError(null);
      try {
        const res = await fetch(`/api/documentos-pessoais/${file.id}?pagina=${page}`);
        if (!res.ok) {
          setError(
            res.status === 415
              ? "Este formato não tem visualizador. Só o Departamento Pessoal abre o arquivo."
              : "Não foi possível abrir o documento.",
          );
          return;
        }
        setPages(Number(res.headers.get("X-Total-Pages") ?? "1") || 1);
        url = URL.createObjectURL(await res.blob());
        // Cancelado durante a espera: libera agora, senão o blob vaza.
        if (cancelled) URL.revokeObjectURL(url);
        else setSrc(url);
      } catch {
        if (!cancelled) setError("Não foi possível abrir o documento.");
      }
    })();

    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [file, page]);

  const close = useCallback(() => {
    setSrc(null);
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!file) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") setPage((p) => Math.min(p + 1, pages));
      if (e.key === "ArrowLeft") setPage((p) => Math.max(p - 1, 1));
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [file, pages, close]);

  if (!file || typeof document === "undefined") return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={file.name}
      // 95 e não 97: a escala de opacidade do Tailwind não tem 97, e a classe
      // simplesmente não é gerada — o visor ficava transparente e o modal
      // atrás dele aparecia por cima do documento.
      className="fixed inset-0 z-[70] flex flex-col bg-background/95"
    >
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <p className="min-w-0 truncate text-sm font-medium text-foreground">{file.name}</p>
        <button
          type="button"
          onClick={close}
          aria-label="Fechar"
          className="focus-ring flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-foreground transition-colors hover:bg-surface-2"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="scrollbar-slim flex-1 overflow-auto p-4">
        {error ? (
          <p className="mx-auto max-w-sm pt-16 text-center text-sm text-danger">{error}</p>
        ) : src ? (
          // eslint-disable-next-line @next/next/no-img-element -- blob:, sem otimização possível
          <img src={src} alt={file.name} className="mx-auto max-w-3xl rounded-lg shadow-lg" />
        ) : (
          <p className="pt-16 text-center text-sm text-muted">Preparando o documento…</p>
        )}
      </div>

      {pages > 1 && (
        <footer className="flex items-center justify-center gap-4 border-t border-border px-4 py-3">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(p - 1, 1))}
            disabled={page <= 1}
            aria-label="Página anterior"
            className="focus-ring flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface text-foreground transition-colors hover:bg-surface-2 disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-xs tabular-nums text-muted">
            Página {page} de {pages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(p + 1, pages))}
            disabled={page >= pages}
            aria-label="Próxima página"
            className="focus-ring flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface text-foreground transition-colors hover:bg-surface-2 disabled:opacity-40"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </footer>
      )}
    </div>,
    document.body,
  );
}
