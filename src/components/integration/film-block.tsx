"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Lock, Play, RotateCcw, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { GatedVideo } from "@/components/onboarding/gated-video";
import { concludeFilm, submitQuiz } from "@/lib/integration/public-actions";
import type { AttemptSummary, TrailFilm } from "@/types/integration";

export interface FilmBlockProps {
  film: TrailFilm;
  position: number;
  /** Resultado da última tentativa, quando houve alguma. */
  lastAttempt?: AttemptSummary;
  /** O convidado já passou pelo portão — sem isso não há cookie para a capa. */
  entered: boolean;
}

/** O arquivo NUNCA é pedido pelo caminho: só pelo id da peça, na rota do módulo. */
function assetUrl(assetId: string, cover = false): string {
  return `/api/integracao/arquivo/${assetId}${cover ? "?capa=1" : ""}`;
}

/**
 * Um filme da trilha: capa, player e questionário, TUDO no mesmo bloco.
 *
 * O questionário era um modal até 28/10/2026. Inline é melhor aqui por um
 * motivo prático: a pergunta é sobre o que acabou de passar na tela, e um
 * modal cobre justamente o vídeo que a pessoa gostaria de ter ao lado ao
 * responder. Agora ele nasce logo abaixo do player, no mesmo cartão.
 *
 * Reprovar NÃO deixa responder de novo na hora: o bloco volta ao início e o
 * vídeo precisa ser assistido outra vez. É o que a mensagem de cobrança diz —
 * "assista ao filme e responda novamente" — e sem isso o convidado chutaria a
 * alternativa seguinte até acertar, que é o oposto de rever o filme.
 */
export function FilmBlock({ film, position, lastAttempt, entered }: FilmBlockProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [watched, setWatched] = useState(false);
  const [failedToLoad, setFailedToLoad] = useState(false);
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [reproved, setReproved] = useState<AttemptSummary | null>(null);
  const [page, setPage] = useState(0);
  const [sending, startSending] = useTransition();

  const locked = film.state === "TRANCADO";
  const done = film.state === "CONCLUIDO";
  const missingFile = film.filePath === null;
  const answered = film.questions.filter((q) => chosen[q.id]).length;
  const complete = answered === film.questions.length && film.questions.length > 0;
  const question = film.questions[page];
  const lastPage = page === film.questions.length - 1;

  function reset() {
    setWatched(false);
    setChosen({});
    setError(null);
    setPage(0);
  }

  async function onFinished() {
    setWatched(true);
    if (film.questions.length > 0) return;
    // Filme sem questionário conclui pelo próprio fim da reprodução.
    const res = await concludeFilm(film.id);
    if (res.ok) router.refresh();
    else setError(res.error ?? "Não foi possível registrar.");
  }

  function send() {
    setError(null);
    // O aviso da reprovação anterior fica enquanto a pessoa reassiste, mas não
    // pode sobreviver ao envio seguinte: aprovado, a tela mostrava os dois.
    setReproved(null);
    startSending(async () => {
      const res = await submitQuiz(
        film.id,
        film.questions.map((q) => ({ questionId: q.id, optionId: chosen[q.id] as string })),
      );

      if (res.passed) {
        router.refresh();
        return;
      }
      if (res.ok === false && res.passed === undefined) {
        setError(res.error ?? "Não foi possível enviar suas respostas.");
        return;
      }
      // Reprovado: volta ao começo do filme.
      setReproved({
        correctCount: res.correctCount ?? 0,
        totalCount: res.totalCount ?? film.questions.length,
        passed: false,
      });
      reset();
      router.refresh();
    });
  }

  return (
    <li
      className={cn(
        "overflow-hidden rounded-xl border bg-surface transition-colors",
        locked ? "border-border opacity-70" : "border-border",
      )}
    >
      <button
        type="button"
        disabled={locked || missingFile}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cn(
          "focus-ring flex w-full items-center gap-4 p-4 text-left",
          locked ? "cursor-not-allowed" : "hover:bg-surface-2",
        )}
      >
        <span className="relative h-16 w-28 shrink-0 overflow-hidden rounded-lg bg-black">
          {/* Só DEPOIS do portão. Pedida antes, a rota responde 401 por falta
              de cookie, e o navegador não repete o pedido quando o portão se
              fecha — o convidado via quatro cartazes quebrados até dar F5. */}
          {entered && (
            /* eslint-disable-next-line @next/next/no-img-element -- a capa vem
               de rota autenticada por cookie de convidado; o otimizador do Next
               buscaria a imagem do servidor, sem esse cookie. */
            <img
              src={assetUrl(film.id, true)}
              alt=""
              className="h-full w-full object-contain"
              onError={(e) => {
                e.currentTarget.style.visibility = "hidden";
              }}
            />
          )}
          <span
            className={cn(
              "absolute inset-0 flex items-center justify-center",
              done ? "bg-black/55" : locked ? "bg-black/65" : "bg-black/25",
            )}
          >
            {done ? (
              <CheckCircle2 className="h-6 w-6 text-primary-foreground" />
            ) : locked ? (
              <Lock className="h-4 w-4 text-primary-foreground" />
            ) : (
              <Play className="ml-0.5 h-5 w-5 fill-current text-primary-foreground" />
            )}
          </span>
        </span>

        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-foreground">
            {position}. {film.title}
          </span>
          {film.focus && <span className="mt-0.5 block text-xs text-muted">{film.focus}</span>}
          {film.lesson && (
            <span className="mt-1 block text-xs italic leading-relaxed text-muted">
              “{film.lesson}”
            </span>
          )}
          {missingFile && !locked && (
            <span className="mt-1 block text-xs text-warning">Filme ainda não disponível.</span>
          )}
          {lastAttempt && !lastAttempt.passed && !done && (
            <span className="mt-1 block text-xs text-warning">
              Última tentativa: {lastAttempt.correctCount} de {lastAttempt.totalCount} —
              assista novamente.
            </span>
          )}
        </span>

        <span className="shrink-0 text-xs text-muted">
          {done ? "Concluído" : locked ? "Bloqueado" : open ? "Fechar" : "Assistir"}
        </span>
      </button>

      {open && !locked && !missingFile && (
        <div className="space-y-4 border-t border-border p-4">
          {!done && (
            <GatedVideo
              src={assetUrl(film.id)}
              finished={watched}
              onProgress={() => undefined}
              onFinished={() => void onFinished()}
              onFailed={() => setFailedToLoad(true)}
            />
          )}

          {failedToLoad && (
            <div className="flex gap-2.5 rounded-lg border border-warning/30 bg-warning/10 p-3">
              <TriangleAlert className="h-4 w-4 shrink-0 text-warning" />
              <p className="text-xs leading-relaxed text-foreground">
                O filme não pôde ser carregado. Avise o time de Desenvolvimento Humano — a
                trilha segue bloqueada até ele abrir.
              </p>
            </div>
          )}

          {reproved && (
            <div className="flex gap-2.5 rounded-lg border border-warning/30 bg-warning/10 p-3">
              <RotateCcw className="h-4 w-4 shrink-0 text-warning" />
              <p className="text-xs leading-relaxed text-foreground">
                Você acertou {reproved.correctCount} de {reproved.totalCount}. Algumas respostas
                não condizem com a mensagem do filme — assista novamente e responda de novo.
              </p>
            </div>
          )}

          {done && (
            <p className="rounded-lg border border-primary/30 bg-primary/10 p-3 text-xs text-foreground">
              Filme concluído. O próximo já está liberado.
            </p>
          )}

          {/* O questionário nasce no MESMO bloco, logo abaixo do player, UMA
              pergunta por vez: cinco de uma vez empurravam o vídeo para fora
              da tela justamente quando ele é a referência da resposta.

              "Próxima" não exige ter respondido — quem quer pular e voltar
              pode, e em branco continua valendo erro no envio. O que trava é
              só o envio final, até as cinco terem resposta. */}
          {!done && watched && question && (
            <div className="space-y-5 rounded-xl border border-border bg-surface-2 p-4">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm font-semibold text-foreground">
                  Questionário — {film.title}
                </p>
                <p className="shrink-0 text-xs text-muted">
                  Pergunta {page + 1} de {film.questions.length}
                </p>
              </div>

              <fieldset>
                <legend className="text-sm font-medium leading-relaxed text-foreground">
                  <span className="text-muted">{page + 1}.</span> {question.label}
                </legend>
                <div className="mt-2 space-y-1.5">
                  {question.options.map((option) => {
                    const selected = chosen[question.id] === option.id;
                    return (
                      <label
                        key={option.id}
                        className={cn(
                          "flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 text-[13px] leading-relaxed transition-colors",
                          selected
                            ? "border-primary bg-primary/10 text-foreground"
                            : "border-border bg-surface text-muted hover:border-border-strong",
                        )}
                      >
                        <input
                          type="radio"
                          name={question.id}
                          value={option.id}
                          checked={selected}
                          onChange={() =>
                            setChosen((prev) => ({ ...prev, [question.id]: option.id }))
                          }
                          className="mt-0.5 h-4 w-4 shrink-0 accent-accent"
                        />
                        <span>{option.label}</span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              {error && (
                <div className="flex gap-2.5 rounded-lg border border-danger/30 bg-danger/10 p-3">
                  <TriangleAlert className="h-4 w-4 shrink-0 text-danger" />
                  <p className="text-xs leading-relaxed text-foreground">{error}</p>
                </div>
              )}

              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-muted">
                  {answered} de {film.questions.length} respondidas
                </p>
                <div className="flex shrink-0 items-center gap-2">
                  {page > 0 && (
                    <Button variant="secondary" onClick={() => setPage(page - 1)}>
                      Anterior
                    </Button>
                  )}
                  {lastPage ? (
                    <Button onClick={send} disabled={!complete || sending}>
                      {sending ? "Enviando" : "Enviar respostas"}
                    </Button>
                  ) : (
                    <Button onClick={() => setPage(page + 1)}>Próxima</Button>
                  )}
                </div>
              </div>
            </div>
          )}

          {!done && !watched && film.questions.length > 0 && (
            <p className="text-xs text-muted">
              O questionário aparece aqui quando o filme terminar.
            </p>
          )}
        </div>
      )}
    </li>
  );
}
