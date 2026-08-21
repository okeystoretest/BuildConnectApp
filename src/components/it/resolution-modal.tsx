"use client";

import { useEffect, useState } from "react";
import { Loader2, Wrench } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ItTicket } from "@/types/it";

export interface ResolutionModalProps {
  ticket: ItTicket | null;
  onClose: () => void;
  onConfirm: (note: string) => void;
}

const MIN_LENGTH = 5;

/**
 * Confirmação de conclusão de chamado de TI. Exige uma breve descrição
 * técnica da solução aplicada antes de mover o card para "Concluído".
 */
export function ResolutionModal({ ticket, onClose, onConfirm }: ResolutionModalProps) {
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!ticket) {
      setNote("");
      setError(null);
      setSubmitting(false);
    }
  }, [ticket]);

  if (!ticket) return null;

  function handleConfirm() {
    const trimmed = note.trim();
    if (trimmed.length < MIN_LENGTH) {
      setError("Descreva a solução aplicada (mínimo de 5 caracteres).");
      return;
    }
    setSubmitting(true);
    onConfirm(trimmed);
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Concluir chamado"
      description={`${ticket.code} · ${ticket.title}`}
      className="max-w-md"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={submitting}>
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {submitting ? "Concluindo" : "Concluir chamado"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 p-6">
        <div className="flex gap-2.5 rounded-lg border border-primary/25 bg-primary/[0.05] p-3">
          <Wrench className="h-4 w-4 shrink-0 text-primary" />
          <p className="text-xs leading-relaxed text-foreground">
            Registre o que foi feito para resolver o chamado. Fica anexado ao histórico do
            atendimento.
          </p>
        </div>

        <div>
          <Label htmlFor="resolution-note">Descrição técnica da solução *</Label>
          <Textarea
            id="resolution-note"
            value={note}
            rows={4}
            placeholder="Ex.: Substituído o cabo de rede e reconfigurado o IP fixo da estação."
            onChange={(e) => {
              setNote(e.target.value);
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
