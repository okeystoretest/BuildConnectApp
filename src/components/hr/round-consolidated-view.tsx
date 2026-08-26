"use client";

import { CalendarClock, ShieldCheck, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { MatrizDecisaoChart } from "@/components/hr/matriz-decisao-chart";
import { Progress } from "@/components/ui/progress";
import { progressColor } from "@/lib/progress-color";
import type { EfficacyConsolidated } from "@/types/evaluation";

const STATUS_LABEL: Record<EfficacyConsolidated["status"], string> = {
  COLETANDO_FEEDBACK: "Coletando feedback",
  AGUARDANDO_AUTO: "Aguardando autoavaliação",
  CONCLUIDA: "Concluída",
};

const STATUS_TONE: Record<EfficacyConsolidated["status"], "info" | "warning" | "primary"> = {
  COLETANDO_FEEDBACK: "info",
  AGUARDANDO_AUTO: "warning",
  CONCLUIDA: "primary",
};

/**
 * Consolidação de uma rodada multidirecional, em tela cheia: uma linha por
 * competência com a nota de cada avaliador (anônima), a média do feedback e a
 * autoavaliação. Exclusivo do DHO — mistura respostas sigilosas.
 */
export function RoundConsolidatedView({ data }: { data: EfficacyConsolidated }) {
  const feedbackPct =
    data.scaleMax > 0 && data.overallFeedback !== null
      ? Math.round((data.overallFeedback / data.scaleMax) * 100)
      : 0;
  const selfPct =
    data.scaleMax > 0 && data.overallSelf !== null
      ? Math.round((data.overallSelf / data.scaleMax) * 100)
      : 0;

  return (
    <div className="space-y-5">
      <header className="rounded-xl border border-border bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted">
              {data.typeTitle}
            </p>
            <h3 className="mt-1 text-2xl font-bold leading-tight text-foreground">
              {data.subjectName}
            </h3>
            <p className="mt-0.5 text-sm text-muted">{data.sector}</p>
          </div>
          <Badge tone={STATUS_TONE[data.status]}>{STATUS_LABEL[data.status]}</Badge>
        </div>

        <div className="mt-5 grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
          <ScoreBlock
            title="Média do feedback"
            value={data.overallFeedback}
            pct={feedbackPct}
            hint={`${data.raterCount}/${data.raterQuota} avaliadores responderam`}
          />
          <ScoreBlock
            title="Autoavaliação"
            value={data.overallSelf}
            pct={selfPct}
            hint={data.hasSelf ? "recebida" : "pendente — libera ao fechar o feedback"}
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-border pt-4 text-xs">
          <span className="inline-flex items-center gap-1.5 text-muted">
            <Users className="h-3.5 w-3.5" />
            Sequência:{" "}
            <span className="font-medium text-foreground">
              {data.raterQuota + 1} avaliadores (o último é a autoavaliação)
            </span>
          </span>
          <span className="inline-flex items-center gap-1.5 text-muted">
            <CalendarClock className="h-3.5 w-3.5" />
            {data.finishedAtLabel ? (
              <>
                Finalizada em{" "}
                <span className="font-medium text-foreground">
                  {data.finishedAtLabel} às {data.finishedAtTimeLabel}
                </span>
              </>
            ) : (
              <>
                Aberta em <span className="font-medium text-foreground">{data.startedAtLabel}</span>
              </>
            )}
          </span>
          <span className="inline-flex items-center gap-1.5 text-muted">
            <ShieldCheck className="h-3.5 w-3.5" />
            Colunas por avaliador são anônimas
          </span>
        </div>
      </header>

      {/* Matriz de Decisão: o gráfico é a leitura principal; a tabela detalha. */}
      {data.matriz && (
        <section className="rounded-xl border border-border bg-surface p-5">
          <h4 className="mb-4 text-sm font-semibold text-foreground">Posição na Matriz de Decisão</h4>
          <MatrizDecisaoChart data={data.matriz} />
        </section>
      )}

      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-border bg-surface-2/60 text-left">
              <th className="px-4 py-3 font-bold text-foreground">Competências</th>
              {data.competencies[0]?.raterScores.map((_, i) => (
                <th key={i} className="px-3 py-3 text-center font-semibold text-muted">
                  Pessoa {i + 1}
                </th>
              ))}
              <th className="px-3 py-3 text-center font-bold text-primary">Média Feedback</th>
              <th className="px-3 py-3 text-center font-bold text-accent">Autoavaliação</th>
            </tr>
          </thead>
          <tbody>
            {data.competencies.map((c, idx) => (
              <tr
                key={c.label}
                className={"border-b border-border " + (idx % 2 === 0 ? "" : "bg-surface-2/40")}
              >
                <td className="px-4 py-2.5 text-foreground">{c.label}</td>
                {c.raterScores.map((v, i) => (
                  <td key={i} className="px-3 py-2.5 text-center font-mono text-muted">
                    {v ?? "—"}
                  </td>
                ))}
                <td className="px-3 py-2.5 text-center font-mono font-semibold text-primary">
                  {c.feedbackAvg ?? "—"}
                </td>
                <td className="px-3 py-2.5 text-center font-mono font-semibold text-accent">
                  {c.selfScore ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border bg-surface-2/60">
              <td className="px-4 py-3 font-bold text-foreground">MÉDIA GERAL</td>
              {data.competencies[0]?.raterScores.map((_, i) => (
                <td key={i} className="px-3 py-3" />
              ))}
              <td className="px-3 py-3 text-center font-mono font-bold text-primary">
                {data.overallFeedback ?? "—"}
              </td>
              <td className="px-3 py-3 text-center font-mono font-bold text-accent">
                {data.overallSelf ?? "—"}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="text-xs text-muted">
        Escala 1 a {data.scaleMax}. A identidade de quem avaliou não é exibida em nenhuma tela.
      </p>
    </div>
  );
}

function ScoreBlock({
  title,
  value,
  pct,
  hint,
}: {
  title: string;
  value: number | null;
  pct: number;
  hint: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface-2 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</p>
      <div className="mt-1 flex items-end justify-between gap-3">
        <span className="font-mono text-2xl font-bold" style={{ color: progressColor(pct) }}>
          {value ?? "—"}
        </span>
        <span className="pb-1 font-mono text-xs text-muted">{pct}%</span>
      </div>
      <Progress className="mt-2" value={pct} label={title} />
      <p className="mt-1.5 text-[11px] text-muted">{hint}</p>
    </div>
  );
}
