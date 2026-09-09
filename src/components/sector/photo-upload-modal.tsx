"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Upload } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { useUploadProgress, uploadPhaseLabel } from "@/lib/use-upload-progress";

const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/heic"];

export interface PhotoUploadModalProps {
  slug: string;
  open: boolean;
  onClose: () => void;
}

export function PhotoUploadModal({ slug, open, onClose }: PhotoUploadModalProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const upload = useUploadProgress();
  const pending = upload.busy;

  function reset() {
    setTitle("");
    setFile(null);
    setPreview(null);
    setError(null);
    upload.reset();
    if (inputRef.current) inputRef.current.value = "";
  }

  function handleClose() {
    if (pending) return;
    reset();
    onClose();
  }

  function pick(selected: File | null) {
    setError(null);
    if (!selected) return;
    if (!ACCEPTED.includes(selected.type)) {
      setError("Formato inválido. Use JPG, PNG, WebP ou HEIC.");
      return;
    }
    setFile(selected);
    setPreview(URL.createObjectURL(selected));
  }

  function submit() {
    if (!file) {
      setError("Selecione uma imagem.");
      return;
    }
    setError(null);
    void (async () => {
      const fd = new FormData();
      fd.set("slug", slug);
      fd.set("title", title.trim() || "Foto");
      fd.set("file", file);
      const res = await upload.send("setor-foto", fd);
      if (res.ok) {
        reset();
        upload.reset();
        onClose();
        router.refresh();
      } else {
        setError(res.error ?? "Falha ao enviar a foto.");
      }
    })();
  }

  return (
    <Modal open={open} onClose={handleClose} className="max-w-md">
      <div className="p-6">
        <h2 className="text-lg font-semibold text-foreground">Enviar foto</h2>
        <p className="mt-0.5 text-xs text-muted">
          A imagem é otimizada e convertida para WebP automaticamente.
        </p>

        <div className="mt-5 space-y-4">
          <div>
            <Label htmlFor="photo-title">Título</Label>
            <Input
              id="photo-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex.: Fachada da vitrine"
            />
          </div>

          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="focus-ring flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-xl border border-dashed border-border bg-surface-2 text-muted transition-colors hover:border-border-strong hover:text-foreground"
          >
            {preview ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={preview} alt="Prévia" className="h-full w-full object-cover" />
            ) : (
              <span className="flex flex-col items-center gap-2 text-xs">
                <Upload className="h-5 w-5" />
                Selecionar imagem
              </span>
            )}
          </button>

          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED.join(",")}
            className="sr-only"
            onChange={(e) => pick(e.target.files?.[0] ?? null)}
          />

          {error && <p className="text-xs text-danger">{error}</p>}

          {/* Progresso REAL de envio: os 100% marcam os bytes entregues, e o
              rótulo vira "Processando…" enquanto o servidor grava. */}
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
