"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Upload } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { MAX_BYTES, validateUploadSizes } from "@/lib/storage/limits";
import { useUploadProgress, uploadPhaseLabel } from "@/lib/use-upload-progress";

/**
 * Envio de documento (PDF/DOC/DOCX/XLS/XLSX/PNG).
 *
 * Os vídeos saíram daqui: sobem em lote pelo `VideoBatchUploadModal`, um por
 * requisição. Este modal ficou só com o caso de um arquivo, sem título.
 */

const DOCUMENT_ACCEPT =
  "application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,image/png";

export interface FileUploadModalProps {
  slug: string;
  open: boolean;
  onClose: () => void;
}

export function FileUploadModal({ slug, open, onClose }: FileUploadModalProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const upload = useUploadProgress();
  const pending = upload.busy;

  function reset() {
    setFile(null);
    setError(null);
  }

  function handleClose() {
    if (pending) return;
    reset();
    upload.reset();
    onClose();
  }

  function submit() {
    if (!file) {
      setError("Selecione um arquivo.");
      return;
    }

    // Tamanho conferido ANTES de subir. O servidor também confere, e continua
    // sendo ele quem manda — mas a checagem dele só acontece depois de receber
    // o arquivo inteiro, e a requisição morre (teto de corpo, memória ou
    // tempo) antes de a Server Action começar.
    const excedeu = validateUploadSizes([
      { label: "O documento", bytes: file.size, max: MAX_BYTES.document },
    ]);
    if (excedeu) {
      setError(excedeu);
      return;
    }

    setError(null);

    void (async () => {
      const fd = new FormData();
      fd.set("slug", slug);
      fd.set("file", file);
      fd.set("name", file.name);

      const res = await upload.send("setor-documento", fd);
      if (res.ok) {
        reset();
        upload.reset();
        onClose();
        router.refresh();
      } else {
        setError(res.error ?? "Falha no envio.");
      }
    })();
  }

  return (
    <Modal open={open} onClose={handleClose} className="max-w-md">
      <div className="p-6">
        <h2 className="text-lg font-semibold text-foreground">Enviar documento</h2>

        <div className="mt-5 space-y-4">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="focus-ring flex h-20 w-full items-center justify-center rounded-xl border border-dashed border-border bg-surface-2 px-3 text-muted transition-colors hover:border-border-strong hover:text-foreground"
          >
            <span className="flex flex-col items-center gap-2 text-center text-xs">
              <Upload className="h-5 w-5" />
              <span className="line-clamp-1 break-all">
                {file ? file.name : "Selecionar arquivo"}
              </span>
            </span>
          </button>
          <input
            id="up-file"
            ref={inputRef}
            type="file"
            accept={DOCUMENT_ACCEPT}
            className="sr-only"
            onChange={(e) => {
              setError(null);
              setFile(e.target.files?.[0] ?? null);
            }}
          />

          {error && <p className="text-xs text-danger">{error}</p>}

          {/* Progresso REAL de envio. Os 100% marcam os bytes entregues, não o
              fim do trabalho: o servidor ainda grava em disco, e por isso o
              rótulo passa a "Processando…" em vez de dizer que acabou. */}
          {pending && (
            <div>
              <Progress
                value={upload.phase === "processing" ? 100 : upload.percent}
                tone="primary"
                label="Progresso do envio"
              />
              <p className="mt-1.5 text-xs text-muted">
                {uploadPhaseLabel(upload.phase, upload.percent)}
              </p>
            </div>
          )}
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <Button variant="secondary" onClick={handleClose} disabled={pending} className="h-11">
            Cancelar
          </Button>
          <Button onClick={submit} disabled={pending} className="h-11">
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            {pending ? uploadPhaseLabel(upload.phase, upload.percent) : "Enviar"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
