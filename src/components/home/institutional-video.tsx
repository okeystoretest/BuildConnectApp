"use client";

import { useRef, useState } from "react";
import { Loader2, Play, RefreshCw, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useRole } from "@/providers/role-provider";

const MAX_SIZE_MB = 500;
const ACCEPTED = ["video/mp4", "video/webm", "video/quicktime"];

/**
 * Vídeo institucional da home. Apenas Admin troca o arquivo.
 *
 * Regra de armazenamento (aplicada no backend): ao confirmar o upload,
 * o vídeo anterior é apagado do disco antes de gravar o novo, para não
 * acumular arquivos órfãos na VPS.
 */
export function InstitutionalVideo({ caption }: { caption?: string }) {
  const { role } = useRole();
  const isAdmin = role === "ADMIN";

  const inputRef = useRef<HTMLInputElement>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  function pickFile(selected: File | undefined) {
    if (!selected) return;
    if (!ACCEPTED.includes(selected.type)) {
      setError("Formato não suportado. Envie MP4, WebM ou MOV.");
      setFile(null);
      return;
    }
    if (selected.size > MAX_SIZE_MB * 1024 * 1024) {
      setError(`Arquivo acima de ${MAX_SIZE_MB} MB.`);
      setFile(null);
      return;
    }
    setError(null);
    setFile(selected);
  }

  async function handleConfirm() {
    if (!file) {
      setError("Selecione um arquivo de vídeo.");
      return;
    }
    setUploading(true);
    // Substituir pela Server Action de upload na integração.
    await new Promise((resolve) => setTimeout(resolve, 700));
    setUploading(false);
    closeModal();
  }

  function closeModal() {
    setModalOpen(false);
    setFile(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <>
      <div className="relative">
        <button
          type="button"
          aria-label="Reproduzir vídeo institucional"
          className="bc-stripes focus-ring group relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-xl border border-border bg-surface-2"
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform group-hover:scale-110">
            <Play className="ml-0.5 h-6 w-6 fill-current" />
          </span>
          {caption && (
            <span className="absolute bottom-3 left-3 rounded bg-background/70 px-2 py-1 font-mono text-[11px] text-muted">
              {caption}
            </span>
          )}
        </button>

        {isAdmin && (
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="focus-ring absolute right-3 top-3 flex items-center gap-1.5 rounded-lg border border-border bg-background/80 px-2.5 py-1.5 text-xs font-medium text-foreground backdrop-blur transition-colors hover:border-border-strong hover:bg-background"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Trocar vídeo
          </button>
        )}
      </div>

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title="Trocar vídeo institucional"
        description="O novo arquivo substitui o atual na página inicial."
        className="max-w-lg"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={closeModal} disabled={uploading}>
              Cancelar
            </Button>
            <Button onClick={handleConfirm} disabled={uploading}>
              {uploading && <Loader2 className="h-4 w-4 animate-spin" />}
              {uploading ? "Enviando" : "Substituir vídeo"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4 p-6">
          <label
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-6 py-10 text-center transition-colors",
              file ? "border-primary/40 bg-primary/[0.04]" : "border-border hover:border-border-strong",
            )}
          >
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED.join(",")}
              className="sr-only"
              onChange={(e) => pickFile(e.target.files?.[0])}
            />
            <RefreshCw className="mb-3 h-5 w-5 text-muted" />
            <span className="text-sm font-medium text-foreground">
              {file ? file.name : "Escolher arquivo de vídeo"}
            </span>
            <span className="mt-1 text-xs text-muted">
              {file
                ? `${(file.size / 1024 / 1024).toFixed(1)} MB`
                : `MP4, WebM ou MOV · até ${MAX_SIZE_MB} MB`}
            </span>
          </label>

          {error && <p className="text-xs text-danger">{error}</p>}

          <div className="flex gap-2.5 rounded-lg border border-warning/30 bg-warning/10 p-3">
            <TriangleAlert className="h-4 w-4 shrink-0 text-warning" />
            <p className="text-xs leading-relaxed text-foreground">
              O vídeo atual será <strong>apagado permanentemente</strong> do servidor ao confirmar.
              Esta ação não pode ser desfeita.
            </p>
          </div>
        </div>
      </Modal>
    </>
  );
}
