"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { getMyVideoRating, submitVideoRating } from "@/lib/video-rating-actions";
import {
  RATING_COMMENT_MAX,
  RATING_CRITERIA,
  RATING_LABELS,
  RATING_MAX,
  RATING_MIN,
  type RatingCriterion,
} from "@/lib/video-rating";

type Stars = Record<RatingCriterion, number | null>;

const EMPTY: Stars = { audio: null, image: null, clarity: null };

/**
 * Avaliação da qualidade do vídeo, exibida assim que a resposta de compreensão
 * é registrada — DENTRO do painel que já está aberto, nunca numa janela nova:
 * dois overlays brigam pelo ESC e pela trava de rolagem (ver `video-modal`).
 *
 * Tudo é opcional. "Pular" e "Enviar" levam ao mesmo lugar: avaliar não pode
 * virar obrigação disfarçada no fim do fluxo.
 *
 * A avaliação pode ser REFEITA. Ao abrir, o formulário busca o que a pessoa já
 * tinha respondido e nasce preenchido — sem isso, reavaliar seria começar do
 * zero e "editar" viraria "apagar sem querer". Enviar substitui a avaliação
 * anterior; desmarcar tudo e enviar a retira.
 */
export function VideoRatingForm({ videoId, onDone }: { videoId: string; onDone: () => void }) {
  const [stars, setStars] = useState<Stars>(EMPTY);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Nulo enquanto a leitura não voltou: o formulário só aceita toque depois de
  // saber o que já existe, senão o primeiro clique some ao chegar a resposta.
  const [previous, setPrevious] = useState<boolean | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    let live = true;
    void getMyVideoRating(videoId).then((mine) => {
      if (!live) return;
      if (mine) {
        setStars({ audio: mine.audio, image: mine.image, clarity: mine.clarity });
        setComment(mine.comment);
      }
      setPrevious(Boolean(mine));
    });
    return () => {
      live = false;
    };
  }, [videoId]);

  const loading = previous === null;
  const busy = pending || loading;

  function send() {
    if (busy) return;
    setError(null);
    start(async () => {
      const res = await submitVideoRating({
        videoId,
        audio: stars.audio,
        image: stars.image,
        clarity: stars.clarity,
        comment: comment.trim() || undefined,
      });
      if (res.ok) onDone();
      else setError(res.error ?? "Não foi possível enviar sua avaliação.");
    });
  }

  return (
    <section aria-label="Avaliação do vídeo" aria-busy={loading} className="mt-3">
      <h4 className="text-sm font-semibold text-foreground">Como foi esse vídeo para você?</h4>
      <p className="mt-0.5 text-xs text-muted">
        {previous
          ? "Você já avaliou este vídeo. Enviar substitui a avaliação anterior."
          : "Opcional — ajuda o gestor a saber qual conteúdo precisa ser melhorado."}
      </p>

      <div className="mt-3 space-y-2.5">
        {RATING_CRITERIA.map((criterion) => (
          <div key={criterion.key} className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-foreground">{criterion.label}</span>
            <div role="radiogroup" aria-label={criterion.label} className="flex gap-1">
              {Array.from({ length: RATING_MAX - RATING_MIN + 1 }, (_, i) => i + RATING_MIN).map(
                (value) => {
                  const active = (stars[criterion.key] ?? 0) >= value;
                  return (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={stars[criterion.key] === value}
                      aria-label={`${criterion.label}: ${value} de ${RATING_MAX} — ${RATING_LABELS[value - 1]}`}
                      title={RATING_LABELS[value - 1]}
                      disabled={busy}
                      onClick={() =>
                        setStars((s) => ({
                          ...s,
                          // Clicar na estrela já marcada desmarca: dá para
                          // voltar a "não avaliei".
                          [criterion.key]: s[criterion.key] === value ? null : value,
                        }))
                      }
                      className="focus-ring rounded p-0.5 disabled:opacity-50"
                    >
                      <Star
                        className={cn(
                          "h-4 w-4 transition-colors",
                          active ? "fill-warning text-warning" : "text-muted",
                        )}
                      />
                    </button>
                  );
                },
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Sem isto, três estrelas significam coisas diferentes para cada pessoa
          — e a média do vídeo passa a somar réguas que não são a mesma. */}
      <p className="mt-2.5 text-[11px] leading-relaxed text-muted">
        <span className="font-medium text-foreground">Legenda: </span>
        {RATING_LABELS.map((l, i) => `${i + 1} = ${l}`).join(" · ")}
      </p>

      <Textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        maxLength={RATING_COMMENT_MAX}
        rows={2}
        placeholder="Quer comentar algo sobre o vídeo? (opcional)"
        className="mt-3"
        disabled={busy}
      />

      {error && <p className="mt-2 text-xs text-danger">{error}</p>}

      <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
        {loading && (
          <span className="mr-auto inline-flex items-center gap-1.5 text-[11px] text-muted">
            <Loader2 className="h-3 w-3 animate-spin" /> Buscando sua avaliação…
          </span>
        )}
        <Button variant="ghost" onClick={onDone} disabled={pending}>
          {previous ? "Fechar" : "Pular"}
        </Button>
        <Button onClick={send} disabled={busy}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Star className="h-4 w-4" />}
          {previous ? "Salvar avaliação" : "Enviar avaliação"}
        </Button>
      </div>
    </section>
  );
}
