"use client";

import { CalendarClock, ClipboardCheck, MessageSquareText, User2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { progressColor } from "@/lib/progress-color";
import type { EvaluationResultDetail, EvaluationResultAnswer } from "@/types/evaluation";

/**
 * Resultado de UMA submissão, em tela cheia.
 *
 * Como só um resultado é visto por vez, a tela é usada por inteiro: cabeçalho
 * com identificação e pontuação, faixa de metadados (avaliador + carimbo de
 * data/hora) e as seções do instrumento em blocos, cada critério com a nota
 * lida de imediato — sem precisar expandir nada.
 */
export function EvaluationResultView({ detail }: { detail: EvaluationResultDetail }) {
  const pct = detail.maxTotal > 0 ? Math.round((detail.total / detail.maxTotal) * 100) : 0;

  return (
    <div className="space-y-5">
      {/* Cabeçalho: quem, o quê, quanto */}
      <header className="rounded-xl border border-border bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted">
              {detail.typeTitle}
              {detail.cycle ? ` · Ciclo ${detail.cycle}` : ""}
            </p>
            <h3 className="mt-1 text-2xl font-bold leading-tight text-foreground">
              {detail.subjectName}
            </h3>
            <p className="mt-0.5 text-sm text-muted">{detail.subjectSector}</p>
          </div>

          <div className="w-full max-w-xs shrink-0">
            <div className="flex items-end justify-between gap-3">
              <span className="font-mono text-3xl font-bold" style={{ color: progressColor(pct) }}>
                {pct}%
              </span>
              <span className="pb-1 font-mono text-sm text-muted">
                {detail.total}/{detail.maxTotal} pts
              </span>
            </div>
            <Progress className="mt-2" value={pct} label="Pontuação total" />
          </div>
        </div>

        {/* Metadados: avaliador + carimbo de data/hora da finalização */}
        <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-border pt-4 text-xs">
          <span className="inline-flex items-center gap-1.5 text-muted">
            <User2 className="h-3.5 w-3.5" />
            Avaliador:{" "}
            <span className="font-medium text-foreground">
              {detail.evaluatorName ?? "não identificado"}
            </span>
          </span>
          <span className="inline-flex items-center gap-1.5 text-muted">
            <CalendarClock className="h-3.5 w-3.5" />
            Finalizada em{" "}
            <span className="font-medium text-foreground">
              {detail.finishedAtLabel} às {detail.finishedAtTimeLabel}
            </span>
          </span>
          <span className="inline-flex items-center gap-1.5 text-muted">
            <ClipboardCheck className="h-3.5 w-3.5" />
            Escala 1 a {detail.scaleMax}
          </span>
        </div>
      </header>

      {/* Seções do instrumento */}
      {detail.sections.map((section) => {
        const sectionPct =
          section.maxTotal > 0 ? Math.round((section.total / section.maxTotal) * 100) : 0;
        return (
          <section key={section.title} className="rounded-xl border border-border bg-surface">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
              <h4 className="text-sm font-semibold text-foreground">{section.title}</h4>
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs text-muted">
                  {section.total}/{section.maxTotal}
                </span>
                <Badge tone="neutral">{sectionPct}%</Badge>
              </div>
            </div>

            <div className="grid gap-px bg-border/60 lg:grid-cols-2">
              {section.answers.map((answer, index) => (
                <AnswerRow
                  key={`${section.title}-${answer.label}-${index}`}
                  index={index + 1}
                  answer={answer}
                  scaleMax={detail.scaleMax}
                />
              ))}
            </div>
          </section>
        );
      })}

      {detail.observations && (
        <section className="rounded-xl border border-border bg-surface p-5">
          <h4 className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
            <MessageSquareText className="h-4 w-4 text-primary" />
            Observações do avaliador
          </h4>
          <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-foreground">
            {detail.observations}
          </p>
        </section>
      )}
    </div>
  );
}

function AnswerRow({
  index,
  answer,
  scaleMax,
}: {
  index: number;
  answer: EvaluationResultAnswer;
  scaleMax: number;
}) {
  const pct = scaleMax > 0 ? Math.round((answer.value / scaleMax) * 100) : 0;
  const color = progressColor(pct);

  return (
    <div className="flex items-start gap-4 bg-surface px-5 py-3">
      <span className="mt-0.5 w-6 shrink-0 font-mono text-xs text-muted">{index}.</span>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-snug text-foreground">{answer.label}</p>
        {answer.helpText && (
          <p className="mt-0.5 text-xs leading-relaxed text-muted">{answer.helpText}</p>
        )}
        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-surface-3">
          <div
            className="h-full rounded-full transition-[width] duration-500 ease-out"
            style={{ width: `${pct}%`, backgroundColor: color }}
          />
        </div>
      </div>

      <span
        className="shrink-0 rounded-md border px-2 py-1 text-center text-xs font-semibold"
        style={{ color, borderColor: `${color}55`, backgroundColor: `${color}1a` }}
      >
        {answer.valueLabel}
      </span>
    </div>
  );
}
