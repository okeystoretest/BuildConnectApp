"use client";

import { useState } from "react";
import { Loader2, TriangleAlert } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import type { ItTicket } from "@/types/it";

export interface DeleteTicketModalProps {
  ticket: ItTicket | null;
  onClose: () => void;
  onConfirm: () => void;
}

/**
 * Confirmação de exclusão DEFINITIVA de um chamado (exclusivo do Admin).
 * Ação irreversível: apaga o registro e os arquivos anexos do disco.
 */
export function DeleteTicketModal({ ticket, onClose, onConfirm }: DeleteTicketModalProps) {
  const [submitting, setSubmitting] = useState(false);
  if (!ticket) return null;

  return (
    <Modal
      open
      onClose={onClose}
      title="Excluir chamado"
      description={`${ticket.code} · ${ticket.title}`}
      className="max-w-md"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              setSubmitting(true);
              onConfirm();
            }}
            disabled={submitting}
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {submitting ? "Excluindo" : "Excluir definitivamente"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 p-6">
        <div className="flex gap-2.5 rounded-lg border border-danger/30 bg-danger/10 p-3">
          <TriangleAlert className="h-4 w-4 shrink-0 text-danger" />
          <p className="text-xs leading-relaxed text-foreground">
            Esta ação é <strong>irreversível</strong>. O chamado, seus anexos e o comprovante
            serão removidos permanentemente do sistema e do disco. Não é possível desfazer.
          </p>
        </div>
      </div>
    </Modal>
  );
}
