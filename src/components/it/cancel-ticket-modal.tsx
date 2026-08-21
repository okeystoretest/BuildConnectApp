"use client";

import { useEffect, useState } from "react";
import { Ban, Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ItTicket } from "@/types/it";

export interface CancelTicketModalProps {
  ticket: ItTicket | null;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}

const MIN_LENGTH = 3;

/**
 * Confirmação de cancelamento de chamado (exclusivo da gestão). O motivo é
 * obrigatório e fica registrado no chamado. Cancelar encerra também a
 * corrida (Trip) associada, se houver.
 */
export function CancelTicketModal({ ticket, onClose, onConfirm }: CancelTicketModalProps) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!ticket) {
      setReason("");
      setError(null);
      setSubmitting(false);
    }
  }, [ticket]);

  if (!ticket) return null;

  function handleConfirm() {
    const trimmed = reason.trim();
    if (trimmed.length < MIN_LENGTH) {
      setError("Informe o motivo do cancelamento.");
      return;
    }
    setSubmitting(true);
    onConfirm(trimmed);
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Cancelar chamado"
      description={`${ticket.code} · ${ticket.title}`}
      className="max-w-md"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Voltar
          </Button>
          <Button variant="danger" onClick={handleConfirm} disabled={submitting}>
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {submitting ? "Cancelando" : "Confirmar cancelamento"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 p-6">
        <div className="flex gap-2.5 rounded-lg border border-danger/30 bg-danger/10 p-3">
          <Ban className="h-4 w-4 shrink-0 text-danger" />
          <p className="text-xs leading-relaxed text-foreground">
            O chamado será encerrado como <strong>cancelado</strong> e sai das colunas ativas. Se
            houver corrida em andamento, ela também é encerrada e o rastreamento é interrompido.
          </p>
        </div>

        <div>
          <Label htmlFor="cancel-reason">Motivo do cancelamento *</Label>
          <Textarea
            id="cancel-reason"
            value={reason}
            rows={3}
            placeholder="Ex.: Solicitação duplicada / cliente cancelou o pedido."
            onChange={(e) => {
              setReason(e.target.value);
              if (error) setError(null);
            }}
            aria-invalid={Boolean(error)}
          />
          {error && <p className="mt-1.5 text-xs text-danger">{error}</p>}
        </div>
      </div>
    </Modal>
  );
}
