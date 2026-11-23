"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Segmented } from "@/components/ui/segmented";
import type { WeeklyReportData, WeeklyReportDetail } from "@/types/weekly-report";
import { ReportCard } from "./report-card";
import { ReportEditor } from "./report-editor";
import { NewReportModal } from "./new-report-modal";
import { KanbanBoard } from "./kanban-board";
import { KanbanSummaryPanel } from "./kanban-summary";

type Vista = "semanas" | "kanban";

/**
 * A ferramenta Relatório Semanal dentro da aba do setor.
 *
 * Duas vistas, que eram as dez abas da planilha: as SEMANAS (abas 1 a 6, uma
 * por relatório) e o KANBAN (abas 7 e 8, permanente).
 *
 * Qual relatório está aberto vem da URL (`?semana=`), não de estado local: o
 * detalhe é carregado no servidor, e recarregar a página no meio de uma sexta
 * tem de voltar para a mesma semana.
 */
export function WeeklyReportPanel({
  data,
  detail,
  onSelect,
  onVista,
}: {
  data: WeeklyReportData;
  /** Relatório aberto, resolvido no servidor a partir de `?semana=`. */
  detail?: WeeklyReportDetail | null;
  /** Escreve `?semana=` na URL. Null volta para a lista. */
  onSelect: (id: string | null) => void;
  /**
   * Avisa qual vista está aberta. Serve só ao layout: o Kanban tem cinco
   * colunas e pede a página larga, as semanas ficam na coluna de leitura — e
   * quem decide a largura é a casca da página, não esta ferramenta.
   */
  onVista?: (vista: Vista) => void;
}) {
  const [vista, setVista] = useState<Vista>("semanas");
  const [novo, setNovo] = useState(false);

  function trocarVista(v: Vista) {
    setVista(v);
    onVista?.(v);
  }

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
        ]}
        value={vista}
        onChange={trocarVista}
        ariaLabel="Vista do Relatório Semanal"
      />

      {vista === "semanas" &&
        (data.reports.length === 0 ? (
          <EmptyState
            title="Nenhuma semana registrada"
            description={
              data.canEdit
                ? "Crie a semana: ela nasce com a pauta do one-on-one, e as entregas, as métricas e os OKRs você adiciona conforme a semana pede."
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
          <KanbanBoard
            slug={data.slug}
            tasks={data.tasks}
            summary={data.summary}
            people={data.people}
            canEdit={data.canEdit}
          />
          <KanbanSummaryPanel summary={data.summary} />
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
