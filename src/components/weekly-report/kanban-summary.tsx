"use client";

import { StatCard } from "@/components/ui/stat-card";
import { TASK_STATUSES } from "@/lib/weekly-report/math";
import {
  TASK_CATEGORY_LABEL,
  TASK_STATUS_LABEL,
  formatarPercentual,
} from "@/lib/weekly-report/labels";
import type { KanbanSummary } from "@/types/weekly-report";

/**
 * A aba 8 da planilha — "Painel Kanban", o resumo automático.
 *
 * Era uma folha de `COUNTIF`/`COUNTIFS` sobre a aba 7. Aqui é a mesma conta,
 * feita em `lib/weekly-report/math` na leitura: não há número guardado para
 * divergir do quadro.
 */
export function KanbanSummaryPanel({ summary }: { summary: KanbanSummary }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Total de tarefas" value={summary.total} />
        <StatCard label="Tarefas publicadas" value={summary.published} tone="primary" />
        <StatCard
          label="Tarefas atrasadas"
          value={summary.overdue}
          tone={summary.overdue > 0 ? "warning" : "foreground"}
          hint={summary.overdue > 0 ? "prazo vencido e não publicado" : undefined}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-border bg-surface">
          <h4 className="border-b border-border px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted">
            Tarefas por status
          </h4>
          <table className="w-full border-collapse">
            <thead className="sr-only">
              <tr>
                <th scope="col">Status</th>
                <th scope="col">Quantidade</th>
                <th scope="col">% do total</th>
              </tr>
            </thead>
            <tbody>
              {summary.byStatus.map((linha) => (
                <tr key={linha.status} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-2 text-xs text-foreground">
                    {TASK_STATUS_LABEL[linha.status]}
                  </td>
                  <td className="w-20 px-2 py-2 text-right text-xs font-semibold text-foreground">
                    {linha.count}
                  </td>
                  <td className="w-24 px-4 py-2 text-right text-xs text-muted">
                    {formatarPercentual(linha.share)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="rounded-xl border border-border bg-surface">
          <h4 className="border-b border-border px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted">
            Categoria × status
          </h4>
          <div className="scrollbar-slim overflow-x-auto">
            <table className="w-full min-w-[480px] border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th
                    scope="col"
                    className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted"
                  >
                    Categoria
                  </th>
                  {TASK_STATUSES.map((s) => (
                    <th
                      key={s}
                      scope="col"
                      className="px-1 py-2 text-center text-[11px] font-semibold text-muted"
                    >
                      {TASK_STATUS_LABEL[s]}
                    </th>
                  ))}
                  <th
                    scope="col"
                    className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-muted"
                  >
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {summary.byCategory.map((linha) => (
                  <tr key={linha.category} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-2 text-xs text-foreground">
                      {TASK_CATEGORY_LABEL[linha.category]}
                    </td>
                    {TASK_STATUSES.map((s) => (
                      <td
                        key={s}
                        className={`px-1 py-2 text-center text-xs ${
                          linha.counts[s] === 0 ? "text-muted/50" : "text-foreground"
                        }`}
                      >
                        {linha.counts[s]}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right text-xs font-semibold text-foreground">
                      {linha.total}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
