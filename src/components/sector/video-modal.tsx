"use client";

import { useEffect, useState } from "react";
import { ExternalLink, FileText, VideoOff, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { VideoItem } from "@/types/sector";

export interface VideoModalProps {
  video: VideoItem;
  open: boolean;
  onClose: () => void;
}

/**
 * Visualização da instrução em vídeo.
 *
 * Regra do módulo: a transcrição NUNCA cobre o player. Ela abre em uma
 * coluna lateral (empilhada abaixo no mobile) e o vídeo segue visível e
 * reproduzindo. A instrução escrita é um arquivo — abre em nova aba.
 */
export function VideoModal({ video, open, onClose }: VideoModalProps) {
  const [showTranscript, setShowTranscript] = useState(false);

  // Fecha com ESC e trava o scroll do body enquanto aberto.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  // Reabrir em outro vídeo não deve herdar a transcrição aberta.
  useEffect(() => {
    if (!open) setShowTranscript(false);
  }, [open]);

  if (!open) return null;

  const hasTranscript = Boolean(video.transcriptText?.trim());
  const hasInstruction = Boolean(video.instructionPath);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Vídeo: ${video.title}`}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-background/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "w-full rounded-2xl border border-border bg-surface shadow-2xl transition-[max-width]",
          showTranscript ? "max-w-6xl" : "max-w-3xl",
        )}
      >
        <header className="flex items-start justify-between gap-4 border-b border-border p-5">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-foreground">{video.title}</h2>
            <p className="mt-0.5 text-xs text-muted">Instrução em vídeo</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="focus-ring flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div
          className={cn(
            "grid gap-5 p-5",
            showTranscript && hasTranscript && "lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]",
          )}
        >
          {/* Player — permanece montado e visível ao abrir a transcrição. */}
          <div className="min-w-0">
            {video.filePath ? (
              <video
                src={video.filePath}
                controls
                autoPlay
                playsInline
                className="aspect-video w-full rounded-xl bg-black"
              />
            ) : (
              <div className="bc-stripes flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-xl bg-surface-2 text-muted">
                <VideoOff className="h-6 w-6" />
                <p className="text-xs">Arquivo de vídeo indisponível.</p>
              </div>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={() => setShowTranscript((v) => !v)}
                disabled={!hasTranscript}
                title={hasTranscript ? undefined : "Nenhuma transcrição enviada para este vídeo."}
              >
                <FileText className="h-4 w-4" />
                {showTranscript ? "Ocultar Transcrição" : "Mostrar Transcrição"}
              </Button>

              {hasInstruction ? (
                <a
                  href={video.instructionPath}
                  target="_blank"
                  rel="noreferrer"
                  className="focus-ring inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-surface-2 px-4 text-sm font-medium text-foreground transition-colors hover:border-border-strong"
                >
                  <ExternalLink className="h-4 w-4" />
                  Instrução Escrita
                </a>
              ) : (
                <Button
                  variant="secondary"
                  disabled
                  title="Nenhuma instrução escrita enviada para este vídeo."
                >
                  <ExternalLink className="h-4 w-4" />
                  Instrução Escrita
                </Button>
              )}
            </div>
          </div>

          {showTranscript && hasTranscript && (
            <aside className="min-w-0 rounded-xl border border-border bg-surface-2 p-4">
              <h3 className="text-sm font-semibold text-foreground">Transcrição</h3>
              <div className="mt-3 max-h-[55vh] overflow-y-auto pr-1">
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted">
                  {video.transcriptText}
                </p>
              </div>
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}
