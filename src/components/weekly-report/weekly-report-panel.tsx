"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Segmented } from "@/components/ui/segmented";
import { INSTRUCTIONS } from "@/lib/weekly-report/templates";
import type { WeeklyReportData, WeeklyReportDetail } from "@/types/weekly-report";
import { ReportCard } from "./report-card";
import { ReportEditor } from "./report-editor";
import { NewReportModal } from "./new-report-modal";
import { KanbanBoard } from "./kanban-board";
import { KanbanSummaryPanel } from "./kanban-summary";

type Vista = "semanas" | "kanban" | "como-usar";

/**
 * A ferramenta Relatório Semanal dentro da aba do setor.
 *
 * Três vistas, que eram as dez abas da planilha: as SEMANAS (abas 1 a 6, uma
 * por relatório), o KANBAN (abas 7 e 8, permanente) e COMO USAR (aba de
 * instruções).
 *
 * Qual relatório está aberto vem da URL (`?semana=`), não de estado local: o
 * detalhe é carregado no servidor, e recarregar a página no meio de uma sexta
 * tem de voltar para a mesma semana.
 */
export function WeeklyReportPanel({
  data,
  detail,
  onSelect,
}: {
  data: WeeklyReportData;
  /** Relatório aberto, resolvido no servidor a partir de `?semana=`. */
  detail?: WeeklyReportDetail | null;
  /** Escreve `?semana=` na URL. Null volta para a lista. */
  onSelect: (id: string | null) => void;
}) {
  const [vista, setVista] = useState<Vista>("semanas");
  const [novo, setNovo] = useState(false);

  // Com um relatório aberto, as vistas saem de cena: o editor É a tela.
  if (detail) {
    return (
      <ReportEditor
        /* A chave garante a remontagem ao trocar de semana: o estado do
           editor vive em inicializadores de useState, e sem ela editar
           `?semana=` na barra de endereços manteria o formulário anterior
           sobre o id novo. */
        key={detail.id}
        slug={data.slug}
        detail={detail}
        onBack={() => onSelect(null)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
            Relatório Semanal
          </h2>
          <p className="text-sm text-muted">
            O que foi entregue na semana, os números dos canais e o que precisa de decisão.
          </p>
        </div>
        {vista === "semanas" && data.canEdit && (
          <Button onClick={() => setNovo(true)}>Nova semana</Button>
        )}
      </div>

      <Segmented
        options={[
          { value: "semanas", label: `Semanas (${data.reports.length})` },
          { value: "kanban", label: `Kanban (${data.summary.total})` },
          { value: "como-usar", label: "Como usar" },
        ]}
        value={vista}
        onChange={setVista}
        ariaLabel="Vista do Relatório Semanal"
      />

      {vista === "semanas" &&
        (data.reports.length === 0 ? (
          <EmptyState
            title="Nenhuma semana registrada"
            description={
              data.canEdit
                ? "Crie a semana: o relatório nasce com as entregas, as métricas, os OKRs e a pauta já montados."
                : "Quando a área registrar a primeira semana, ela aparece aqui."
            }
            action={
              data.canEdit ? (
                <Button onClick={() => setNovo(true)}>Criar a primeira</Button>
              ) : undefined
            }
          />
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {data.reports.map((report) => (
              <ReportCard key={report.id} report={report} onOpen={onSelect} />
            ))}
          </div>
        ))}

      {vista === "kanban" && (
        <div className="space-y-5">
          <KanbanBoard slug={data.slug} tasks={data.tasks} canEdit={data.canEdit} />
          <KanbanSummaryPanel summary={data.summary} />
        </div>
      )}

      {vista === "como-usar" && (
        <div className="grid gap-3 sm:grid-cols-2">
          {INSTRUCTIONS.map((item) => (
            <div key={item.title} className="rounded-xl border border-border bg-surface p-4">
              <h3 className="text-sm font-semibold text-foreground">{item.title}</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted">{item.body}</p>
            </div>
          ))}
        </div>
      )}

      {novo && (
        <NewReportModal
          slug={data.slug}
          open
          onClose={() => setNovo(false)}
          onCreated={(id) => {
            setNovo(false);
            onSelect(id);
          }}
        />
      )}
    </div>
  );
}
