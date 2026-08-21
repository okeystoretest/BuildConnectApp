"use client";

import { useState, useTransition } from "react";
import { ChevronDown, ClipboardCheck, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { fetchEvaluationDetail } from "@/lib/evaluation-results-actions";
import type { EvaluationResultGroup, EvaluationResultDetail } from "@/types/evaluation";

export function EvaluationResultsPanel({ groups }: { groups: readonly EvaluationResultGroup[] }) {
  if (groups.length === 0) {
    return (
      <EmptyState
        icon={<ClipboardCheck className="h-5 w-5" />}
        title="Nenhum resultado ainda"
        description="Os resultados aparecem aqui assim que uma avaliação for enviada por um gestor ou administrador."
      />
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Resultados consolidados por colaborador. Expanda uma avaliação para ver a pontuação de cada
        critério.
      </p>

      {groups.map((group) => (
        <div key={group.subjectId} className="rounded-xl border border-border bg-surface p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">{group.subjectName}</p>
              <p className="text-xs text-muted">{group.sector}</p>
            </div>
            <Badge tone="neutral">
              {group.results.length} {group.results.length === 1 ? "avaliação" : "avaliações"}
            </Badge>
          </div>

          <div className="space-y-2">
            {group.results.map((r) => (
              <ResultRow key={r.id} id={r.id} title={r.typeTitle} cycle={r.cycle} total={r.total} maxTotal={r.maxTotal} dateLabel={r.createdAtLabel} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ResultRow({
  id,
  title,
  cycle,
  total,
  maxTotal,
  dateLabel,
}: {
  id: string;
  title: string;
  cycle?: number;
  total: number;
  maxTotal: number;
  dateLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<EvaluationResultDetail | null>(null);
  const [loading, startLoad] = useTransition();

  const pct = maxTotal > 0 ? Math.round((total / maxTotal) * 100) : 0;

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !detail) {
      startLoad(async () => {
        const res = await fetchEvaluationDetail(id);
        if (res.ok && res.detail) setDetail(res.detail);
      });
    }
  }

  return (
    <div className="rounded-lg border border-border bg-surface-2">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="focus-ring flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left"
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">
            {title}
            {cycle ? <span className="ml-2 text-xs text-muted">Ciclo {cycle}</span> : null}
          </p>
          <p className="text-[11px] text-muted">{dateLabel}</p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="font-mono text-sm font-semibold text-primary">
            {total}/{maxTotal}
          </span>
          <ChevronDown className={cn("h-4 w-4 text-muted transition-transform", open && "rotate-180")} />
        </div>
      </button>

      {open && (
        <div className="border-t border-border px-3 py-3">
          <div className="mb-3">
            <Progress value={pct} />
            <p className="mt-1 text-right text-[11px] text-muted">{pct}%</p>
          </div>

          {loading && !detail && (
            <div className="flex items-center gap-2 py-3 text-xs text-muted">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando respostas…
            </div>
          )}

          {detail && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                {detail.answers.map((a, i) => (
                  <div
                    key={`${a.label}-${i}`}
                    className="flex items-center justify-between gap-3 rounded-md bg-surface px-3 py-1.5"
                  >
                    <span className="min-w-0 truncate text-xs text-foreground">
                      <span className="mr-2 text-muted">{i + 1}.</span>
                      {a.label}
                    </span>
                    <span className="shrink-0 font-mono text-xs font-semibold text-primary">
                      {detail.scaleLabels.length > 0
                        ? (detail.scaleLabels[a.value - 1] ?? a.value)
                        : a.value}
                    </span>
                  </div>
                ))}
              </div>

              {detail.evaluatorName && (
                <p className="text-[11px] text-muted">Avaliado por {detail.evaluatorName}</p>
              )}
              {detail.observations && (
                <div className="rounded-md border border-border bg-surface p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                    Observações
                  </p>
                  <p className="mt-1 text-xs text-foreground">{detail.observations}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
