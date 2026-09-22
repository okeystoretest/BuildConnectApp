"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, FileText, Star, VideoOff, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { usePortalTarget } from "@/components/ui/use-portal-target";
import { markVideoEnded } from "@/lib/sector-actions";
import { ComprehensionForm } from "./comprehension-form";
import { VideoRatingForm } from "./video-rating-form";
import type { VideoItem } from "@/types/sector";

export interface VideoModalProps {
  video: VideoItem;
  open: boolean;
  onClose: () => void;
  /**
   * Instruções em Vídeo: ao chegar ao fim, pergunta se a pessoa compreendeu —
   * e é a resposta que conclui o vídeo. Falso nas vitrines (Coleção,
   * Workshop), que não têm regra de conclusão.
   */
  comprehension?: boolean;
  /** Abrir já com a pergunta visível (o card estava em "Responder"). */
  askNow?: boolean;
  /**
   * Abrir já reproduzindo (veio do aviso de reprovação). O navegador pode
   * recusar: sem gesto do usuário só autoriza vídeo mudo, e treinamento mudo
   * é pior que play manual. Recusou, o vídeo fica carregado com os controles
   * nativos à vista.
   */
  autoPlay?: boolean;
  /** Progresso ou resposta gravados: quem abriu recarrega a página ao fechar. */
  onChanged?: () => void;
}

/**
 * Visualização da instrução em vídeo.
 *
 * Regra do módulo: a transcrição NUNCA cobre o player. Ela abre em uma
 * coluna lateral (empilhada abaixo no mobile) e o vídeo segue visível e
 * reproduzindo.
 *
 * Só monta o conteúdo quando aberto: o estado da sessão (pergunta aberta,
 * resposta enviada) nasce/morre com ele.
 */
export function VideoModal({
  video,
  open,
  onClose,
  comprehension,
  askNow,
  autoPlay,
  onChanged,
}: VideoModalProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const target = usePortalTarget(open, rootRef);

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

  if (!open || !target) return null;

  return createPortal(
    <VideoModalContent
      video={video}
      onClose={onClose}
      comprehension={Boolean(comprehension)}
      askNow={Boolean(askNow)}
      autoPlay={Boolean(autoPlay)}
      onChanged={onChanged}
      rootRef={rootRef}
    />,
    target,
  );
}

function VideoModalContent({
  video,
  onClose,
  comprehension,
  askNow,
  autoPlay,
  onChanged,
  rootRef,
}: {
  video: VideoItem;
  onClose: () => void;
  comprehension: boolean;
  askNow: boolean;
  autoPlay: boolean;
  onChanged?: () => void;
  rootRef: React.RefObject<HTMLDivElement>;
}) {
  const [showTranscript, setShowTranscript] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [answered, setAnswered] = useState(false);
  // Avaliação do vídeo: acende quando a resposta é registrada e sai ao enviar
  // ou pular.
  const [rating, setRating] = useState(false);
  const [asking, setAsking] = useState(askNow);
  const [ended, setEnded] = useState(Boolean(video.ended) || video.watched);
  const changed = useRef(false);

  const askable = comprehension && !video.comprehension && !answered;
  // Instruções: concluir é responder. Vitrines não têm regra de conclusão.
  const completed = comprehension && (video.watched || answered);
  /*
   * O selo "Avaliado" mora AQUI, e não na miniatura do card: quem está olhando
   * a grade quer saber o que falta assistir, e saber que o gestor já deu a
   * nota só interessa a quem abriu aquele vídeo.
   */
  const graded = comprehension && video.comprehension === "AVALIADA";
  /*
   * Quem já respondeu pode avaliar o vídeo a qualquer momento, inclusive
   * reabrindo para trocar as estrelas — o servidor substitui a avaliação
   * anterior. Sem este botão, avaliar só existia na janela de segundos logo
   * depois de enviar a resposta, e quem clicasse em "Pular" perdia a chance.
   */
  const rateable = comprehension && (answered || video.watched || Boolean(video.comprehension));

  // Fim de uma Instrução em Vídeo: grava uma vez e abre a pergunta (se ainda
  // não respondida). Nas vitrines não acontece nada.
  function onEnded() {
    if (!comprehension) return;
    if (askable) setAsking(true);
    if (ended) return;
    setEnded(true);
    void markVideoEnded({ videoId: video.id }).then((res) => {
      if (res.ok) changed.current = true;
    });
  }

  // Ao fechar, quem abriu recarrega a página se algo mudou no servidor.
  const onChangedRef = useRef(onChanged);
  onChangedRef.current = onChanged;
  useEffect(() => {
    return () => {
      if (changed.current) onChangedRef.current?.();
    };
  }, []);

  // Play automático com desistência silenciosa. Nunca cai para mudo: os
  // controles nativos já estão à vista quando o navegador recusa.
  useEffect(() => {
    if (!autoPlay) return;
    const el = videoRef.current;
    if (!el) return;
    void el.play().catch(() => {});
  }, [autoPlay]);

  const hasTranscript = Boolean(video.transcriptText?.trim());

  /*
   * O overlay VAI POR PORTAL, e isso não é detalhe de organização: era a
   * causa do modal aparecer cortado, preso a um retângulo com barra de
   * rolagem própria. Renderizado onde o card mora, ele fica dentro do
   * `TabPanel`, que leva `animate-tab-in` — e essa animação usa
   * `animation-fill-mode: both`, então o `transform: translateY(0)` do último
   * quadro PERMANECE no elemento. Ancestral com `transform` vira bloco
   * contentor, e `position: fixed` passa a medir contra o painel da aba em
   * vez da janela. A mesma armadilha está descrita em `it-dashboard.tsx`.
   *
   * `items-center` junto com `overflow-y-auto` NO MESMO elemento cortava a
   * tela de outro jeito: quando o conteúdo passa da altura da janela, a
   * centralização empurra o topo para FORA da área rolável, e a barra não
   * alcança o que ficou acima — cabeçalho e começo do player ficavam
   * inacessíveis. Por isso a rolagem fica no elemento de fora e a
   * centralização no invólucro de dentro, com `min-h-full`: centraliza quando
   * cabe, e vira topo-alinhado com rolagem quando não cabe.
   */
  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Vídeo: ${video.title}`}
      className="fixed inset-0 z-50 overflow-y-auto bg-background/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="flex min-h-full items-center justify-center">
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
                ref={videoRef}
                src={video.filePath}
                poster={video.thumbnailPath}
                controls
                autoPlay={!askNow}
                playsInline
                onEnded={onEnded}
                // `max-h-[70vh]` para o player não empurrar o botão de
                // transcrição para fora em tela baixa.
                className="aspect-video max-h-[70vh] w-full rounded-xl bg-black"
              />
            ) : (
              <div className="bc-stripes flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-xl bg-surface-2 text-muted">
                <VideoOff className="h-6 w-6" />
                <p className="text-xs">Arquivo de vídeo indisponível.</p>
              </div>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button
                variant="secondary"
                onClick={() => setShowTranscript((v) => !v)}
                disabled={!hasTranscript}
                title={hasTranscript ? undefined : "Nenhuma transcrição enviada para este vídeo."}
              >
                <FileText className="h-4 w-4" />
                {showTranscript ? "Ocultar Transcrição" : "Mostrar Transcrição"}
              </Button>
              {rateable && !rating && (
                <Button variant="secondary" onClick={() => setRating(true)}>
                  <Star className="h-4 w-4" />
                  Avaliar este vídeo
                </Button>
              )}
              {completed && (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                  <CheckCircle2 className="h-3.5 w-3.5" /> {graded ? "Avaliado" : "Assistido"}
                </span>
              )}
            </div>

            {asking && askable && (
              <div className="mt-4">
                <ComprehensionForm
                  videoId={video.id}
                  onSubmitted={() => {
                    changed.current = true;
                    setAnswered(true);
                    setAsking(false);
                    setRating(true);
                  }}
                  onLater={() => setAsking(false)}
                />
              </div>
            )}
            {answered && (
              <div className="mt-4 rounded-xl border border-primary/25 bg-primary/10 p-3">
                <p className="inline-flex items-center gap-1.5 text-xs text-primary">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Resposta enviada — vídeo concluído. O
                  gestor do seu setor vai avaliar.
                </p>
              </div>
            )}

            {/* Caixa própria, fora da confirmação da resposta: avaliar o vídeo
                também acontece muito depois, quando a pessoa reabre o player. */}
            {rating && (
              <div className="mt-4 rounded-xl border border-border bg-surface-2 p-3">
                <VideoRatingForm videoId={video.id} onDone={() => setRating(false)} />
              </div>
            )}
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
    </div>
  );
}
