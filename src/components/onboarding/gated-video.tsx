"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Maximize, Minimize, Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";

export interface GatedVideoProps {
  /** Caminho público do arquivo (/uploads/...). */
  src: string;
  /** Percentual assistido, 0–100. Sobe a cada `timeupdate`. */
  onProgress: (percent: number) => void;
  /** O vídeo chegou ao fim — é o que libera o acesso. */
  onFinished: () => void;
  /** O arquivo não abriu. Quem chama decide liberar mesmo assim. */
  onFailed: () => void;
  /** Trava os controles depois de concluído. */
  finished: boolean;
}

/**
 * Player dos vídeos OBRIGATÓRIOS (boas-vindas da plataforma e do setor).
 *
 * Existe como peça única porque as duas telas precisam exatamente das mesmas
 * três regras, e escrevê-las duas vezes é como elas divergem:
 *
 * 1. SEM controles nativos. Com eles bastaria arrastar a barra até o fim para
 *    "assistir" — o portão deixaria de ser um portão. Play/pause e progresso
 *    são nossos, e a barra é somente leitura.
 *
 * 2. Tela cheia pedida no CONTÊINER, nunca no `<video>`. Como os controles são
 *    nossos e vivem sobrepostos ao vídeo, pedir tela cheia no elemento de
 *    vídeo pintaria só ele: a pessoa ficaria em tela cheia sem botão de pausa
 *    e sem saber quanto falta, e sem os controles nativos para socorrê-la.
 *
 *    Esse contêiner é descendente do `Modal`, e é daí que vinha a tela cheia
 *    que animava sem expandir: o portal do modal seguia o `fullscreenElement`
 *    para dentro de si mesmo e derrubava o fullscreen. A guarda está em
 *    `lib/portal-target`.
 *
 * 3. Falha de carregamento não prende ninguém. O arquivo pode ter sumido do
 *    disco; quem chama libera o acesso com aviso, sem marcar como assistido.
 */
export function GatedVideo({ src, onProgress, onFinished, onFailed, finished }: GatedVideoProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  const toggle = useCallback(() => {
    const video = videoRef.current;
    if (!video || finished) return;
    if (video.paused) {
      void video.play().catch(() => onFailed());
    } else {
      video.pause();
    }
  }, [finished, onFailed]);

  const toggleFullscreen = useCallback(() => {
    const box = containerRef.current;
    if (!box) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    } else {
      void box.requestFullscreen().catch(() => undefined);
    }
  }, []);

  // A tela cheia também sai pelo ESC e pelo botão do navegador, então o estado
  // acompanha o evento em vez de confiar no nosso clique.
  useEffect(() => {
    function onChange() {
      setFullscreen(document.fullscreenElement === containerRef.current);
    }
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // Enquanto o vídeo obrigatório está aberto, a barra de espaço não deve rolar
  // a página atrás do modal — ela dá play/pause.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== " " && e.key !== "Spacebar") return;
      e.preventDefault();
      toggle();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [toggle]);

  return (
    // Em tela cheia o contêiner É a tela: sem moldura, e centralizando o
    // vídeo em toda a altura disponível — senão ele fica encostado no topo,
    // com borda arredondada em volta de uma área preta do tamanho do monitor.
    <div
      ref={containerRef}
      className={cn(
        "relative overflow-hidden bg-black",
        fullscreen
          ? "flex h-full w-full items-center justify-center"
          : "rounded-xl border border-border",
      )}
    >
      <video
        ref={videoRef}
        src={src}
        // `max-h` some em tela cheia: ali o vídeo deve ocupar o que tem.
        className={
          fullscreen
            ? "h-full max-h-full w-full object-contain"
            : "aspect-video max-h-[70vh] w-full object-contain"
        }
        playsInline
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(e) => {
          const video = e.currentTarget;
          if (!video.duration || !Number.isFinite(video.duration)) return;
          onProgress(Math.min(100, (video.currentTime / video.duration) * 100));
        }}
        onEnded={() => {
          onProgress(100);
          setPlaying(false);
          onFinished();
        }}
        onError={() => onFailed()}
      />

      {!playing && !finished && (
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

      <button
        type="button"
        onClick={toggleFullscreen}
        aria-label={fullscreen ? "Sair da tela cheia" : "Ver em tela cheia"}
        className="focus-ring absolute bottom-3 right-3 flex h-10 w-10 items-center justify-center rounded-full bg-background/80 text-foreground backdrop-blur"
      >
        {fullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
      </button>
    </div>
  );
}
