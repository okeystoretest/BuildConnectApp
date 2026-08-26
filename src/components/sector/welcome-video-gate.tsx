"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Progress } from "@/components/ui/progress";
import { markWelcomeVideoWatched } from "@/lib/welcome-video-actions";

export interface WelcomeVideoGateProps {
  /** Slug do subsetor (a página em que o usuário entrou). */
  slug: string;
  sectorLabel: string;
  /** Caminho público do vídeo (/uploads/...). */
  path: string;
  title?: string | null;
}

/**
 * Vídeo obrigatório de boas-vindas do setor, na PRIMEIRA visita do usuário.
 *
 * O modal não é dispensável e o botão de entrar só libera quando o vídeo
 * termina. Por isso o player não usa os controles nativos: com eles bastaria
 * arrastar a barra até o fim. O controle é nosso — play/pause e uma barra de
 * progresso somente leitura.
 *
 * A visualização é gravada no banco (por usuário), então ela acompanha a
 * pessoa em qualquer dispositivo e o setor não volta a bloquear.
 *
 * Falha de carregamento NÃO prende ninguém: se o arquivo não abrir, o acesso é
 * liberado com aviso e sem marcar como assistido — o vídeo volta na próxima
 * visita, quando o arquivo estiver de pé.
 */
export function WelcomeVideoGate({ slug, sectorLabel, path, title }: WelcomeVideoGateProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [open, setOpen] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [finished, setFinished] = useState(false);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);

  const toggle = useCallback(() => {
    const video = videoRef.current;
    if (!video || finished) return;
    if (video.paused) {
      void video.play().catch(() => setFailed(true));
    } else {
      video.pause();
    }
  }, [finished]);

  // Enquanto o vídeo obrigatório está aberto, a barra de espaço não deve
  // rolar a página atrás do modal — ela dá play/pause.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== " " && e.key !== "Spacebar") return;
      e.preventDefault();
      toggle();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [toggle]);

  async function enter() {
    setSaving(true);
    if (!failed) await markWelcomeVideoWatched(slug);
    setSaving(false);
    setOpen(false);
  }

  const canEnter = finished || failed;

  return (
    <Modal
      open={open}
      dismissible={false}
      className="max-w-3xl"
      title={`Boas-vindas · ${sectorLabel}`}
      description={
        title ??
        "Assista ao vídeo completo para acessar o setor. Ele é exibido apenas na primeira visita."
      }
      footer={
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex-1">
            <Progress value={progress} label="Progresso do vídeo" />
            <p className="mt-1.5 text-xs text-muted">
              {failed
                ? "Não foi possível carregar o vídeo."
                : finished
                  ? "Vídeo concluído."
                  : `${Math.round(progress)}% assistido`}
            </p>
          </div>
          <Button onClick={enter} disabled={!canEnter || saving} className="shrink-0">
            {saving ? "Entrando" : "Entrar no setor"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 p-6">
        <div className="relative overflow-hidden rounded-xl border border-border bg-black">
          <video
            ref={videoRef}
            src={path}
            className="aspect-video w-full"
            playsInline
            preload="metadata"
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onTimeUpdate={(e) => {
              const video = e.currentTarget;
              if (!video.duration || !Number.isFinite(video.duration)) return;
              setProgress(Math.min(100, (video.currentTime / video.duration) * 100));
            }}
            onEnded={() => {
              setProgress(100);
              setFinished(true);
              setPlaying(false);
            }}
            onError={() => setFailed(true)}
          />

          {!playing && !finished && !failed && (
            <button
              type="button"
              onClick={toggle}
              aria-label="Reproduzir vídeo"
              className="focus-ring absolute inset-0 flex items-center justify-center bg-black/40 transition-colors hover:bg-black/30"
            >
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Play className="ml-1 h-7 w-7 fill-current" />
              </span>
            </button>
          )}

          {playing && (
            <button
              type="button"
              onClick={toggle}
              aria-label="Pausar vídeo"
              className="focus-ring absolute bottom-3 left-3 flex h-10 w-10 items-center justify-center rounded-full bg-background/80 text-foreground backdrop-blur"
            >
              <Pause className="h-4 w-4" />
            </button>
          )}
        </div>

        {failed && (
          <div className="flex gap-2.5 rounded-lg border border-warning/30 bg-warning/10 p-3">
            <TriangleAlert className="h-4 w-4 shrink-0 text-warning" />
            <p className="text-xs leading-relaxed text-foreground">
              O arquivo do vídeo não pôde ser carregado. O acesso ao setor foi liberado, mas a
              visualização não será registrada — o vídeo volta a aparecer na próxima visita. Avise o
              responsável pelo setor.
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}
