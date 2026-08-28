"use client";

import { useState } from "react";
import { Download, Maximize2, Paperclip, Wrench } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { itCategoryTone, IT_STATUS_LABEL, IT_STATUS_TONE } from "@/lib/it-data";
import { ImageLightbox } from "@/components/ui/image-lightbox";
import type { ItTicket, TicketAttachment } from "@/types/it";

export interface TicketDetailModalProps {
  ticket: ItTicket | null;
  onClose: () => void;
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-0.5 text-sm text-foreground">{value}</p>
    </div>
  );
}

export function TicketDetailModal({ ticket, onClose }: TicketDetailModalProps) {
  const [lightbox, setLightbox] = useState<{ src: string; name: string } | null>(null);
  if (!ticket) return null;

  const attachments: readonly TicketAttachment[] = ticket.attachments ?? [];
  const hasProof = Boolean(ticket.proofUrl);

  return (
    <Modal
      open
      onClose={onClose}
      title={ticket.title}
      description={`${ticket.code} · aberto em ${ticket.openedLabel} às ${ticket.timeLabel}`}
      className="max-w-2xl"
      footer={
        <div className="flex justify-end">
          <Button variant="secondary" onClick={onClose}>
            Fechar
          </Button>
        </div>
      }
    >
      <div className="space-y-5 p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={IT_STATUS_TONE[ticket.status]}>{IT_STATUS_LABEL[ticket.status]}</Badge>
          <Badge tone={itCategoryTone(ticket.category)}>{ticket.category}</Badge>
        </div>

        {/* Descrição integral — sem truncamento, ocupa a largura toda. */}
        {ticket.description && (
          <div>
            <p className="mb-1 text-[11px] uppercase tracking-wide text-muted">Descrição</p>
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
              {ticket.description}
            </p>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Solicitante" value={ticket.requesterName} />
          <Field label="Setor" value={ticket.requesterSector} />
          <Field label="Unidade" value={ticket.requesterUnit} />
          <Field label="Responsável" value={ticket.assignee ?? "Não atribuído"} />
          <Field label="Aberto em" value={`${ticket.openedLabel} · ${ticket.timeLabel}`} />
          {ticket.durationLabel && <Field label="Duração" value={ticket.durationLabel} />}
          {typeof ticket.distanceKm === "number" && (
            <Field label="Quilometragem" value={`${ticket.distanceKm} km`} />
          )}
        </div>

        {/* Descrição técnica da solução (chamados de TI concluídos). */}
        {ticket.resolutionNote && (
          <div className="rounded-xl border border-primary/25 bg-primary/[0.05] p-4">
            <p className="mb-1 flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-primary">
              <Wrench className="h-3.5 w-3.5" />
              Solução aplicada
            </p>
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
              {ticket.resolutionNote}
            </p>
          </div>
        )}

        {/* Anexos enviados na abertura. */}
        {attachments.length > 0 && (
          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted">
              <Paperclip className="h-3.5 w-3.5" />
              Anexos ({attachments.length})
            </p>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {attachments.map((att) => (
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
                      aria-label="Baixar anexo"
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

        {/* Comprovante de entrega (motoristas). */}
        {hasProof && ticket.proofUrl && (
          <div>
            <p className="mb-1.5 text-[11px] uppercase tracking-wide text-muted">
              Comprovante de entrega
            </p>
            <div className="group relative overflow-hidden rounded-xl border border-border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={ticket.proofUrl}
                alt={`Comprovante do chamado ${ticket.code}`}
                className="max-h-64 w-full cursor-zoom-in object-cover"
                onClick={() =>
                  setLightbox({
                    src: ticket.proofUrl!,
                    name: ticket.proofName ?? `comprovante-${ticket.code}.webp`,
                  })
                }
              />
              <div className="absolute right-2 top-2 flex gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    setLightbox({
                      src: ticket.proofUrl!,
                      name: ticket.proofName ?? `comprovante-${ticket.code}.webp`,
                    })
                  }
                  aria-label="Ver em tela cheia"
                  className="focus-ring flex h-8 w-8 items-center justify-center rounded-lg bg-background/85 text-foreground backdrop-blur transition-colors hover:bg-background"
                >
                  <Maximize2 className="h-4 w-4" />
                </button>
                <a
                  href={ticket.proofUrl}
                  download={ticket.proofName ?? `comprovante-${ticket.code}.webp`}
                  aria-label="Baixar comprovante"
                  className="focus-ring flex h-8 w-8 items-center justify-center rounded-lg bg-background/85 text-foreground backdrop-blur transition-colors hover:bg-background"
                >
                  <Download className="h-4 w-4" />
                </a>
              </div>
            </div>
          </div>
        )}
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
