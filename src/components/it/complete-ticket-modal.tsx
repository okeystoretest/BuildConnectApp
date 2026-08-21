"use client";

import { useEffect, useState } from "react";
import { Camera, Loader2, TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ItTicket } from "@/types/it";

const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/heic"];
const MAX_SIZE_MB = 10;

export interface CompletionData {
  proof: File | null;
  distanceKm: number | null;
}

export interface CompleteTicketModalProps {
  ticket: ItTicket | null;
  onClose: () => void;
  onConfirm: (data: CompletionData) => void;
}

/**
 * Confirmação de conclusão de chamado logístico.
 * Comprovante de entrega é obrigatório; a quilometragem alimenta as
 * métricas do dashboard.
 */
export function CompleteTicketModal({ ticket, onClose, onConfirm }: CompleteTicketModalProps) {
  const [proof, setProof] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [distance, setDistance] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!ticket) {
      setProof(null);
      setDistance("");
      setError(null);
    }
  }, [ticket]);

  useEffect(() => {
    if (!proof) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(proof);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [proof]);

  if (!ticket) return null;

  function pickProof(file: File | undefined) {
    if (!file) return;
    if (!ACCEPTED.includes(file.type)) {
      setError("Use JPG, PNG, WebP ou HEIC.");
      return;
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      setError(`Arquivo acima de ${MAX_SIZE_MB} MB.`);
      return;
    }
    setError(null);
    setProof(file);
  }

  async function handleConfirm() {
    if (!proof) {
      setError("Anexe o comprovante de entrega para concluir.");
      return;
    }
    setSubmitting(true);
    await new Promise((resolve) => setTimeout(resolve, 400));
    setSubmitting(false);
    onConfirm({
      proof,
      distanceKm: distance ? Number(distance.replace(",", ".")) : null,
    });
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
            {submitting ? "Concluindo" : "Concluir entrega"}
          </Button>
        </div>
      }
    >
      <div className="space-y-5 p-6">
        <div>
          <Label htmlFor="distance">Quilometragem percorrida (km)</Label>
          <Input
            id="distance"
            inputMode="decimal"
            value={distance}
            placeholder="Ex.: 12,5"
            onChange={(e) => setDistance(e.target.value.replace(/[^\d.,]/g, ""))}
            className="h-11 rounded-xl"
          />
        </div>

        <div>
          <Label htmlFor="proof">Comprovante de entrega *</Label>
          {preview ? (
            <div className="relative overflow-hidden rounded-xl border border-border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview} alt="Comprovante de entrega" className="max-h-56 w-full object-cover" />
              <button
                type="button"
                onClick={() => setProof(null)}
                aria-label="Remover comprovante"
                className="focus-ring absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-lg bg-background/85 text-muted transition-colors hover:text-danger"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <label
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-6 py-8 text-center transition-colors",
                error ? "border-danger/50" : "border-border hover:border-border-strong",
              )}
            >
              <input
                id="proof"
                type="file"
                accept={ACCEPTED.join(",")}
                capture="environment"
                className="sr-only"
                onChange={(e) => pickProof(e.target.files?.[0])}
              />
              <Camera className="mb-2 h-5 w-5 text-muted" />
              <span className="text-sm font-medium text-foreground">Anexar foto</span>
              <span className="mt-0.5 text-xs text-muted">Toque para usar a câmera ou galeria</span>
            </label>
          )}
          {error && <p className="mt-1.5 text-xs text-danger">{error}</p>}
        </div>

        <div className="flex gap-2.5 rounded-lg border border-warning/30 bg-warning/10 p-3">
          <TriangleAlert className="h-4 w-4 shrink-0 text-warning" />
          <p className="text-xs leading-relaxed text-foreground">
            O comprovante fica anexado ao chamado e disponível para a administração.
          </p>
        </div>
      </div>
    </Modal>
  );
}
