"use client";

import { Badge } from "@/components/ui/badge";
import {
  REPORT_STATUS_LABEL,
  REPORT_STATUS_TONE,
  formatarDataHora,
  formatarDiaMes,
} from "@/lib/weekly-report/labels";
import type { WeeklyReportListItem } from "@/types/weekly-report";

/**
 * O card de uma semana na lista.
 *
 * Mostra os três contadores do rodapé da aba 2 mais o que falta responder —
 * é o que permite escolher qual semana abrir sem abrir nenhuma.
 */
export function ReportCard({
  report,
  onOpen,
}: {
  report: WeeklyReportListItem;
  onOpen: (id: string) => void;
}) {
  const ano = report.periodStart.slice(0, 4);

  return (
    <button
      type="button"
      onClick={() => onOpen(report.id)}
      className="focus-ring group flex w-full flex-col gap-3 rounded-xl border border-border bg-surface p-4 text-left transition-colors hover:border-border-strong"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-foreground">Semana {report.weekNumber}</p>
          <p className="text-xs text-muted">
            {formatarDiaMes(report.periodStart)} a {formatarDiaMes(report.periodEnd)}/{ano}
          </p>
        </div>
        <Badge tone={REPORT_STATUS_TONE[report.status]}>
          {REPORT_STATUS_LABEL[report.status]}
        </Badge>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span className="text-primary">🟢 {report.onTrack}</span>
        <span className="text-warning">🟡 {report.attention}</span>
        <span className="text-danger">🔴 {report.blocked}</span>
        {report.pending > 0 && (
          <span className="text-muted">{report.pending} sem resposta</span>
        )}
      </div>

      <p className="text-[11px] text-muted">
        {report.status === "APROVADO" && report.approverName
          ? `Aprovado por ${report.approverName} em ${formatarDataHora(report.approvedAt)}`
          : report.submittedAt
            ? `Enviado em ${formatarDataHora(report.submittedAt)}`
            : `Preenchendo${report.authorName ? ` · ${report.authorName}` : ""}`}
      </p>
    </button>
  );
}
