"use client";

import { useEffect, useState, useTransition } from "react";
import { Download, Loader2, Lock, Maximize2, Paperclip, ShieldCheck } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ImageLightbox } from "@/components/ui/image-lightbox";
import { cn } from "@/lib/utils";
import { saveReportNote } from "@/lib/reports/admin-actions";
import {
  REPORT_STATUS_LABEL,
  REPORT_STATUS_ORDER,
  REPORT_STATUS_TONE,
  type ReportItem,
  type ReportStatus,
} from "@/types/report";

export interface ReportDetailModalProps {
  report: ReportItem | null;
  onClose: () => void;
  /** Muda o status pelo mesmo caminho do arrastar no quadro. */
  onStatusChange: (report: ReportItem, status: ReportStatus) => void;
  /** Somente leitura: usado quando o detalhe vem do histórico. */
  readOnly?: boolean;
}

/**
 * Detalhe da denúncia: relato integral, evidências e a tratativa do DHO.
 *
 * O relato original é imutável — só a tratativa é editável, e ela é gravada
 * ao lado, nunca por cima do texto recebido. Não há ação de exclusão em lugar
 * nenhum desta tela.
 */
export function ReportDetailModal({
  report,
  onClose,
  onStatusChange,
  readOnly = false,
}: ReportDetailModalProps) {
  const [note, setNote] = useState("");
  const [lightbox, setLightbox] = useState<{ src: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  useEffect(() => {
    setNote(report?.handlingNote ?? "");
    setError(null);
    setSaved(false);
  }, [report?.id, report?.handlingNote]);

  if (!report) return null;

  function persistNote() {
    if (!report) return;
    const id = report.id;
    setError(null);
    setSaved(false);
    start(async () => {
      const res = await saveReportNote({ reportId: id, handlingNote: note.trim() });
      if (res.ok) setSaved(true);
      else setError(res.error ?? "Falha ao salvar a tratativa.");
    });
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Denúncia ${report.code}`}
      description={`Recebida em ${report.createdLabel} às ${report.timeLabel}`}
      className="max-w-2xl"
      footer={
        <div className="flex justify-end">
          <Button variant="secondary" onClick={onClose}>
            Fechar
          </Button>
        </div>
      }
    >
      <div className="scrollbar-slim max-h-[70vh] space-y-5 overflow-y-auto p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={REPORT_STATUS_TONE[report.status]}>
            {REPORT_STATUS_LABEL[report.status]}
          </Badge>
          <Badge tone="neutral">Destinatário: {report.targetName}</Badge>
        </div>

        <div className="flex gap-2.5 rounded-lg border border-primary/25 bg-primary/[0.06] p-3">
          <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
          <p className="text-xs leading-relaxed text-foreground">
            Registro anônimo: o sistema não guarda quem enviou. A denúncia{" "}
            <strong>não pode ser excluída</strong> — encerrá-la apenas a tira do quadro e a
            envia ao histórico.
          </p>
        </div>

        <div>
          <p className="mb-1 text-[11px] uppercase tracking-wide text-muted">Relato</p>
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
            {report.description}
          </p>
        </div>

        {report.attachments.length > 0 && (
          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted">
              <Paperclip className="h-3.5 w-3.5" />
              Evidências ({report.attachments.length})
            </p>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {report.attachments.map((att) => (
                <div
                  key={att.id}
                  className="group relative overflow-hidden rounded-xl border border-border"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={att.url}
                    alt={att.name}
                    className="h-28 w-full cursor-zoom-in object-cover"
                    onClick={() => setLightbox({ src: att.url, name: att.name })}
                  />
                  <div className="absolute right-1.5 top-1.5 flex gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={() => setLightbox({ src: att.url, name: att.name })}
                      aria-label="Ver em tela cheia"
                      className="focus-ring flex h-7 w-7 items-center justify-center rounded-lg bg-background/85 text-foreground backdrop-blur transition-colors hover:bg-background"
                    >
                      <Maximize2 className="h-3.5 w-3.5" />
                    </button>
                    <a
                      href={att.url}
                      download={att.name}
                      aria-label="Baixar evidência"
                      className="focus-ring flex h-7 w-7 items-center justify-center rounded-lg bg-background/85 text-foreground backdrop-blur transition-colors hover:bg-background"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tratativa do DHO — ao lado do relato, nunca por cima dele. */}
        <div>
          <Label htmlFor="report-note">Tratativa do DHO</Label>
          <Textarea
            id="report-note"
            value={note}
            rows={4}
            disabled={readOnly || pending}
            placeholder="Providências tomadas, apurações, encaminhamentos…"
            onChange={(e) => {
              setNote(e.target.value);
              setSaved(false);
            }}
          />
          {!readOnly && (
            <div className="mt-2 flex items-center gap-3">
              <Button size="sm" onClick={persistNote} disabled={pending}>
                {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                {pending ? "Salvando" : "Salvar tratativa"}
              </Button>
              {saved && <span className="text-xs text-primary">Tratativa salva.</span>}
              {error && <span className="text-xs text-danger">{error}</span>}
            </div>
          )}
        </div>

        {/* Fluxo de status. No histórico a denúncia é só leitura. */}
        <div>
          <Label>Status</Label>
          {readOnly ? (
            <p className="flex items-center gap-1.5 text-xs text-muted">
              <Lock className="h-3.5 w-3.5" />
              Denúncia arquivada — o fluxo já foi encerrado.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {REPORT_STATUS_ORDER.map((option) => {
                const active = report.status === option;
                return (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={active}
                    onClick={() => onStatusChange(report, option)}
                    className={cn(
                      "focus-ring rounded-lg border px-3 py-2 text-xs font-semibold transition-colors",
                      active
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-surface-2 text-muted hover:text-foreground",
                    )}
                  >
                    {REPORT_STATUS_LABEL[option]}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {lightbox && (
        <ImageLightbox
          open
          src={lightbox.src}
          alt={lightbox.name}
          downloadName={lightbox.name}
          onClose={() => setLightbox(null)}
        />
      )}
    </Modal>
  );
}
