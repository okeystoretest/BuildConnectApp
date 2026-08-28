"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { History, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useToast } from "@/providers/toast-provider";
import { setReportStatus } from "@/lib/reports/admin-actions";
import {
  REPORT_STATUS_DOT,
  REPORT_STATUS_LABEL,
  REPORT_STATUS_ORDER,
  type ReportItem,
  type ReportStatus,
} from "@/types/report";
import { ReportCard } from "./report-card";
import { ReportDetailModal } from "./report-detail-modal";
import { ReportHistoryModal } from "./report-history-modal";

export interface ReportBoardProps {
  reports: readonly ReportItem[];
}

/**
 * Central de Denúncias — quadro do DHO.
 *
 * Reaproveita o layout do quadro de chamados (colunas por status, cards
 * arrastáveis, histórico atrás de um botão) para que quem já trata chamados
 * não precise aprender outra tela. O que muda é o conteúdo, não a mecânica.
 *
 * Duas diferenças de comportamento, ambas deliberadas:
 *  - NÃO existe excluir. Nenhum botão, nenhuma Server Action. Denúncia
 *    registrada permanece no sistema.
 *  - Encerrar não some com o card: ele fica 30 minutos no quadro (contagem
 *    visível no próprio card) e depois vai para o Histórico.
 *
 * As mutações são otimistas e confirmadas com `router.refresh()`, que também
 * é o que faz a lista do servidor recalcular a janela de arquivamento.
 */
export function ReportBoard({ reports: source }: ReportBoardProps) {
  const router = useRouter();
  const { error: toastError } = useToast();

  // Cópia local para refletir a mudança antes de o servidor responder.
  const [local, setLocal] = useState<readonly ReportItem[] | null>(null);
  const reports = local ?? source;

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overStatus, setOverStatus] = useState<ReportStatus | null>(null);
  const [selected, setSelected] = useState<ReportItem | null>(null);
  const [archived, setArchived] = useState<ReportItem | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [, startTransition] = useTransition();

  function changeStatus(report: ReportItem, status: ReportStatus) {
    if (report.status === status) return;

    const closedAt = status === "ENCERRADA" ? new Date().toISOString() : undefined;
    setLocal((prev) =>
      (prev ?? source).map((item) =>
        item.id === report.id ? { ...item, status, closedAt } : item,
      ),
    );
    setSelected((prev) => (prev && prev.id === report.id ? { ...prev, status, closedAt } : prev));

    startTransition(async () => {
      const res = await setReportStatus({ reportId: report.id, status });
      if (!res.ok) {
        toastError(res.error ?? "Não foi possível atualizar a denúncia.");
        setLocal(null);
      }
      router.refresh();
    });
  }

  function handleDrop(status: ReportStatus) {
    if (!draggingId) return;
    const report = reports.find((item) => item.id === draggingId);
    setDraggingId(null);
    setOverStatus(null);
    if (report) changeStatus(report, status);
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          Arraste os cards entre as colunas para mover a tratativa. Denúncias{" "}
          <strong className="font-semibold text-foreground">não podem ser excluídas</strong>;
          encerrá-las as envia ao histórico após 30 minutos.
        </p>
        <Button variant="secondary" size="sm" onClick={() => setHistoryOpen(true)}>
          <History className="h-4 w-4" />
          Histórico
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {REPORT_STATUS_ORDER.map((status) => {
          const column = reports.filter((report) => report.status === status);
          return (
            <section
              key={status}
              aria-label={`Coluna ${REPORT_STATUS_LABEL[status]}`}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setOverStatus(status);
              }}
              onDragLeave={() => setOverStatus((prev) => (prev === status ? null : prev))}
              onDrop={(e) => {
                e.preventDefault();
                handleDrop(status);
              }}
              className={cn(
                "flex min-w-0 flex-1 flex-col rounded-xl border bg-surface-2/40 p-3 transition-colors",
                overStatus === status ? "border-primary/50 bg-primary/[0.04]" : "border-border",
              )}
            >
              <header className="mb-3 flex items-center justify-between">
                <span className="flex items-center gap-2 text-xs font-semibold text-foreground">
                  <span
                    className={cn("h-2 w-2 rounded-full", REPORT_STATUS_DOT[status])}
                    aria-hidden
                  />
                  {REPORT_STATUS_LABEL[status]}
                </span>
                <span className="text-xs text-muted">{column.length}</span>
              </header>

              <div className="scrollbar-slim flex-1 space-y-3 overflow-y-auto pr-0.5 [max-height:calc(100vh-20rem)]">
                {column.map((report) => (
                  <ReportCard
                    key={report.id}
                    report={report}
                    dragging={draggingId === report.id}
                    onDragStart={setDraggingId}
                    onDragEnd={() => setDraggingId(null)}
                    onOpen={setSelected}
                  />
                ))}

                {column.length === 0 && (
                  <p className="rounded-lg border border-dashed border-border py-8 text-center text-xs text-muted">
                    {status === "ABERTA" ? "Nenhuma denúncia" : "Solte um card aqui"}
                  </p>
                )}
              </div>
            </section>
          );
        })}
      </div>

      {reports.length === 0 && (
        <p className="mt-4 flex items-center justify-center gap-2 rounded-xl border border-dashed border-border py-6 text-xs text-muted">
          <ShieldAlert className="h-4 w-4" />
          Nenhuma denúncia em tratativa. As encerradas ficam no Histórico.
        </p>
      )}

      <ReportDetailModal
        report={selected}
        onClose={() => setSelected(null)}
        onStatusChange={changeStatus}
      />

      <ReportHistoryModal
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onSelect={(report) => {
          setHistoryOpen(false);
          setArchived(report);
        }}
      />

      {/* Denúncia do histórico: leitura, sem mudança de status. */}
      <ReportDetailModal
        report={archived}
        readOnly
        onClose={() => setArchived(null)}
        onStatusChange={() => {}}
      />
    </>
  );
}
