"use client";

import { useState, useTransition } from "react";
import { Loader2, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { submitVideoRating } from "@/lib/video-rating-actions";
import {
  RATING_COMMENT_MAX,
  RATING_CRITERIA,
  RATING_MAX,
  RATING_MIN,
  type RatingCriterion,
} from "@/lib/video-rating";

/**
 * Avaliação da qualidade do vídeo, exibida assim que a resposta de compreensão
 * é registrada — DENTRO do painel que já está aberto, nunca numa janela nova:
 * dois overlays brigam pelo ESC e pela trava de rolagem (ver `video-modal`).
 *
 * Tudo é opcional. "Pular" e "Enviar" levam ao mesmo lugar: avaliar não pode
 * virar obrigação disfarçada no fim do fluxo.
 */
export function VideoRatingForm({ videoId, onDone }: { videoId: string; onDone: () => void }) {
  const [stars, setStars] = useState<Record<RatingCriterion, number | null>>({
    audio: null,
    image: null,
    clarity: null,
  });
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function send() {
    if (pending) return;
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
    <section aria-label="Avaliação do vídeo" className="mt-3">
      <h4 className="text-sm font-semibold text-foreground">Como foi esse vídeo para você?</h4>
      <p className="mt-0.5 text-xs text-muted">
        Opcional — ajuda o gestor a saber qual conteúdo precisa ser melhorado.
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
                      aria-label={`${criterion.label}: ${value} de ${RATING_MAX}`}
                      disabled={pending}
                      onClick={() =>
                        setStars((s) => ({
                          ...s,
                          // Clicar na estrela já marcada desmarca: dá para
                          // voltar a "não avaliei".
                          [criterion.key]: s[criterion.key] === value ? null : value,
                        }))
                      }
                      className="focus-ring rounded p-0.5"
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

      <Textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        maxLength={RATING_COMMENT_MAX}
        rows={2}
        placeholder="Quer comentar algo sobre o vídeo? (opcional)"
        className="mt-3"
        disabled={pending}
      />

      {error && <p className="mt-2 text-xs text-danger">{error}</p>}

      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={onDone} disabled={pending}>
          Pular
        </Button>
        <Button onClick={send} disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Star className="h-4 w-4" />}
          Enviar avaliação
        </Button>
      </div>
    </section>
  );
}
