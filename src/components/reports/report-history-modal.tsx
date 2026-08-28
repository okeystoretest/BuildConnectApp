"use client";

import { useEffect, useState } from "react";
import { Archive, Clock, Loader2, Paperclip } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { listReportHistory } from "@/lib/reports/admin-actions";
import type { ReportItem } from "@/types/report";

export interface ReportHistoryModalProps {
  open: boolean;
  onClose: () => void;
  /** Abre o detalhe (em leitura) da denúncia escolhida. */
  onSelect: (report: ReportItem) => void;
}

/**
 * Histórico definitivo da Central de Denúncias: as encerradas que já
 * cumpriram os 30 minutos de permanência no quadro.
 *
 * Nada some daqui — denúncia não é excluída. A lista é buscada na abertura do
 * modal, não junto com a página do DHO.
 */
export function ReportHistoryModal({ open, onClose, onSelect }: ReportHistoryModalProps) {
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    setLoading(true);
    setError(null);
    listReportHistory()
      .then((res) => {
        if (cancelled) return;
        if (res.ok) setReports(res.reports);
        else setError(res.error ?? "Não foi possível carregar o histórico.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Histórico de denúncias"
      description="Denúncias encerradas e arquivadas — 30 minutos após o encerramento elas saem do quadro e passam a ser lidas aqui."
      className="max-w-3xl"
      footer={
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-muted">
            {loading ? "Carregando…" : `${reports.length} arquivada(s)`}
          </span>
          <Button variant="secondary" onClick={onClose}>
            Fechar
          </Button>
        </div>
      }
    >
      <div className="scrollbar-slim max-h-[60vh] overflow-y-auto p-6">
        {loading && (
          <p className="flex items-center justify-center gap-2 py-10 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando histórico…
          </p>
        )}

        {!loading && error && (
          <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
            {error}
          </p>
        )}

        {!loading && !error && reports.length === 0 && (
          <EmptyState
            icon={<Archive className="h-5 w-5" />}
            title="Nada arquivado ainda"
            description="As denúncias encerradas aparecem aqui 30 minutos depois do encerramento."
          />
        )}

        {!loading && !error && reports.length > 0 && (
          <ul className="space-y-2">
            {reports.map((report) => (
              <li key={report.id}>
                <button
                  type="button"
                  onClick={() => onSelect(report)}
                  className="focus-ring w-full rounded-xl border border-border bg-surface p-3.5 text-left transition-colors hover:border-border-strong hover:bg-surface-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-[11px] text-muted">{report.code}</span>
                    <span className="text-[11px] text-muted">
                      Destinatário: {report.targetName}
                    </span>
                  </div>

                  <p className="mt-1.5 line-clamp-2 text-sm leading-snug text-foreground">
                    {report.description}
                  </p>

                  <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Recebida em {report.createdLabel}
                    </span>
                    {report.attachments.length > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <Paperclip className="h-3 w-3" />
                        {report.attachments.length} evidência(s)
                      </span>
                    )}
                    {report.handlingNote && <span>Com tratativa registrada</span>}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
