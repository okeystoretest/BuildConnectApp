"use client";

import { Pencil } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { formatarDiaMes } from "@/lib/weekly-report/labels";
import type { WeeklyReportListItem } from "@/types/weekly-report";

/**
 * O card de uma semana na lista.
 *
 * Serve para escolher qual semana abrir sem abrir nenhuma: quanto da semana
 * já foi respondido, como está o humor dela nos três sinais da planilha, e o
 * destaque — a frase que a reunião de sexta lê primeiro.
 *
 * O card inteiro ABRE a semana para leitura; o lápis leva direto à edição.
 * São dois botões irmãos, e não um dentro do outro: botão dentro de botão é
 * HTML inválido, e o teclado perderia um dos dois.
 */
export function ReportCard({
  report,
  canEdit,
  onOpen,
  onEdit,
}: {
  report: WeeklyReportListItem;
  canEdit: boolean;
  onOpen: (id: string) => void;
  onEdit: (id: string) => void;
}) {
  const ano = report.periodStart.slice(0, 4);
  const total = report.onTrack + report.attention + report.blocked + report.pending;
  const respondidas = total - report.pending;

  return (
    <div className="group relative flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 transition-colors hover:border-border-strong">
      {/* A camada que recebe o clique do card. Fica ABAIXO do lápis. */}
      <button
        type="button"
        onClick={() => onOpen(report.id)}
        aria-label={`Ver a semana ${report.weekNumber}`}
        className="focus-ring absolute inset-0 z-10 rounded-xl"
      />
      {canEdit && (
        <button
          type="button"
          onClick={() => onEdit(report.id)}
          aria-label={`Editar a semana ${report.weekNumber}`}
          title="Editar"
          className="focus-ring absolute right-2.5 top-2.5 z-20 rounded-md p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      )}

      <div className="pr-8">
        <p className="text-base font-semibold text-foreground">Semana {report.weekNumber}</p>
        <p className="text-xs text-muted">
          {formatarDiaMes(report.periodStart)} a {formatarDiaMes(report.periodEnd)}/{ano}
        </p>
      </div>

      {total === 0 ? (
        <p className="text-xs text-muted">Sem entregas registradas.</p>
      ) : (
        <div className="space-y-1.5">
          <Progress value={(respondidas / total) * 100} />
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span className="text-muted">
              {respondidas} de {total} {total === 1 ? "entrega" : "entregas"}
            </span>
            {/* Só o sinal que existe: três zeros em toda semana nova seriam
                ruído na hora de bater o olho na lista. */}
            {report.onTrack > 0 && <span className="text-primary">🟢 {report.onTrack}</span>}
            {report.attention > 0 && <span className="text-warning">🟡 {report.attention}</span>}
            {report.blocked > 0 && <span className="text-danger">🔴 {report.blocked}</span>}
          </div>
        </div>
      )}

      {report.highlight && (
        <p className="line-clamp-2 text-xs leading-relaxed text-foreground/80">
          {report.highlight}
        </p>
      )}

      {report.authorName && (
        <p className="mt-auto text-[11px] text-muted">Criada por {report.authorName}</p>
      )}
    </div>
  );
}
