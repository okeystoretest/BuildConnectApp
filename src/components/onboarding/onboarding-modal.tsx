"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Progress } from "@/components/ui/progress";

export interface OnboardingModalProps {
  open: boolean;
  onComplete: () => void;
  /** Duração simulada do vídeo em segundos. Substituída pelo player real depois. */
  duration?: number;
}

/**
 * Vídeo obrigatório de boas-vindas. Não é dispensável: o acesso só libera
 * quando a reprodução chega ao fim.
 */
export function OnboardingModal({ open, onComplete, duration = 12 }: OnboardingModalProps) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const finished = progress >= 100;

  const clear = useCallback(() => {
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
  }, []);

  useEffect(() => {
    if (!playing || finished) {
      clear();
      return;
    }
    const step = 100 / (duration * 10);
    timer.current = setInterval(() => {
      setProgress((prev) => Math.min(100, prev + step));
    }, 100);
    return clear;
  }, [playing, finished, duration, clear]);

  useEffect(() => {
    if (finished) setPlaying(false);
  }, [finished]);

  return (
    <Modal
      open={open}
      dismissible={false}
      title="Bem-vindo(a) à Build.Connect"
      description="Assista ao vídeo de integração completo para liberar o acesso à plataforma."
      className="max-w-xl"
      footer={
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex-1">
            <Progress value={progress} label="Progresso do vídeo" />
            <p
              className={cn(
                "mt-1.5 text-xs transition-colors",
                finished ? "text-primary" : "text-muted",
              )}
            >
              {finished
                ? "Vídeo concluído — acesso liberado."
                : playing
                  ? "Reproduzindo o vídeo de integração."
                  : "Toque em reproduzir para começar."}
            </p>
          </div>
          <Button onClick={onComplete} disabled={!finished} className="shrink-0">
            Continuar para a plataforma
          </Button>
        </div>
      }
    >
      <button
        type="button"
        onClick={() => !finished && setPlaying((v) => !v)}
        disabled={finished}
        aria-label={playing ? "Pausar vídeo" : "Reproduzir vídeo"}
        className="bc-stripes focus-ring group relative flex aspect-video w-full items-center justify-center bg-surface-2 disabled:cursor-default"
      >
        <span
          className={cn(
            "flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform",
            !finished && "group-hover:scale-110",
            playing && "scale-95 opacity-80",
          )}
        >
          {playing ? (
            <span className="flex gap-1" aria-hidden>
              <span className="h-4 w-1.5 rounded-sm bg-current" />
              <span className="h-4 w-1.5 rounded-sm bg-current" />
            </span>
          ) : (
            <Play className="ml-0.5 h-6 w-6 fill-current" />
          )}
        </span>
      </button>
    </Modal>
  );
}
