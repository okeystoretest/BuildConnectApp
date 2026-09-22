import { CalendarClock, CheckCircle2, MinusCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { QUESTION_KIND_LABEL, type FormResponseDetail } from "@/types/form";

/**
 * Uma resposta de formulário do DHO, relida por quem a enviou.
 *
 * Mesma diagramação do resultado de instrumento (`EvaluationResultView`):
 * cabeçalho com identificação e carimbo, depois as perguntas em blocos, cada
 * uma com o que foi respondido lido de imediato, sem expandir nada.
 */
export function FormResponseView({ detail }: { detail: FormResponseDetail }) {
  const answered = detail.answers.filter((a) => a.answered).length;

  return (
    <div className="space-y-5">
      <header className="rounded-xl border border-border bg-surface p-5">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted">
          Formulário do DHO
        </p>
        <h3 className="mt-1 text-lg font-semibold text-foreground">{detail.formTitle}</h3>
        {detail.description && <p className="mt-1 text-sm text-muted">{detail.description}</p>}

        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border pt-3 text-xs text-muted">
          <span className="inline-flex items-center gap-1.5">
            <CalendarClock className="h-3.5 w-3.5" />
            Enviado em {detail.submittedAtLabel} às {detail.submittedAtTimeLabel}
          </span>
          <span>
            {answered} de {detail.answers.length}{" "}
            {detail.answers.length === 1 ? "pergunta respondida" : "perguntas respondidas"}
          </span>
          {/* Só a partir da 2ª: reabrir um formulário incrementa a rodada, e
              marcar "rodada 1" em tudo seria ruído. */}
          {detail.round > 1 && <span>Rodada {detail.round}</span>}
        </div>
      </header>

      <ol className="space-y-3">
        {detail.answers.map((a, i) => (
          <li
            key={a.questionId}
            className={cn(
              "rounded-xl border p-4",
              a.answered ? "border-border bg-surface" : "border-dashed border-border bg-surface/50",
            )}
          >
            <div className="flex items-start gap-3">
              <span className="mt-0.5 text-xs font-semibold text-muted">{i + 1}.</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">{a.label}</p>
                {a.helpText && <p className="mt-0.5 text-xs text-muted">{a.helpText}</p>}
                <p className="mt-0.5 text-[10px] uppercase tracking-wide text-muted">
                  {QUESTION_KIND_LABEL[a.kind]}
                </p>

                <p
                  className={cn(
                    "mt-2.5 whitespace-pre-wrap rounded-lg border p-3 text-sm leading-relaxed",
                    a.answered
                      ? "border-border bg-surface-2 text-foreground"
                      : "border-transparent bg-transparent px-0 py-0 italic text-muted",
                  )}
                >
                  {a.answerLabel}
                </p>
              </div>
              {/* Cor nunca sozinha: o ícone acompanha o estado da pergunta. */}
              {a.answered ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" aria-label="Respondida" />
              ) : (
                <MinusCircle className="h-4 w-4 shrink-0 text-muted" aria-label="Não respondida" />
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
