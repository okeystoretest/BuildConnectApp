"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Upload } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { uploadIntegrationMap } from "@/lib/hr-actions";

export interface MapUploadModalProps {
  open: boolean;
  onClose: () => void;
}

export function MapUploadModal({ open, onClose }: MapUploadModalProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [scope, setScope] = useState("");
  const [progress, setProgress] = useState("0");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function reset() {
    setTitle("");
    setScope("");
    setProgress("0");
    setFile(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function handleClose() {
    if (pending) return;
    reset();
    onClose();
  }

  function submit() {
    if (!title.trim()) return setError("Informe o título.");
    if (!scope.trim()) return setError("Informe a abrangência.");
    setError(null);

    start(async () => {
      const fd = new FormData();
      fd.set("title", title.trim());
      fd.set("scope", scope.trim());
      fd.set("progress", progress || "0");
      fd.set("status", Number(progress) >= 100 ? "CONCLUIDO" : "EM_ANDAMENTO");
      if (file) fd.set("file", file);

      const res = await uploadIntegrationMap(fd);
      if (res.ok) {
        reset();
        onClose();
        router.refresh();
      } else {
        setError(res.error ?? "Falha ao salvar o mapa.");
      }
    });
  }

  return (
    <Modal open={open} onClose={handleClose} className="max-w-md">
      <div className="p-6">
        <h2 className="text-lg font-semibold text-foreground">Novo mapa de integração</h2>

        <div className="mt-5 space-y-4">
          <div>
            <Label htmlFor="map-title">Título</Label>
            <Input
              id="map-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex.: Trilha Logística"
            />
          </div>
          <div>
            <Label htmlFor="map-scope">Abrangência</Label>
            <Input
              id="map-scope"
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              placeholder="Ex.: Logística"
            />
          </div>
          <div>
            <Label htmlFor="map-progress">Progresso (%)</Label>
            <Input
              id="map-progress"
              type="number"
              min={0}
              max={100}
              value={progress}
              onChange={(e) => setProgress(e.target.value)}
            />
          </div>

          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="focus-ring flex h-20 w-full items-center justify-center rounded-xl border border-dashed border-border bg-surface-2 text-muted transition-colors hover:border-border-strong hover:text-foreground"
          >
            <span className="flex flex-col items-center gap-2 text-xs">
              <Upload className="h-5 w-5" />
              {file ? file.name : "Selecionar PDF (opcional)"}
            </span>
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            className="sr-only"
            onChange={(e) => {
              setError(null);
              setFile(e.target.files?.[0] ?? null);
            }}
          />

          {error && <p className="text-xs text-danger">{error}</p>}
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <Button variant="secondary" onClick={handleClose} disabled={pending} className="h-11">
            Cancelar
          </Button>
          <Button onClick={submit} disabled={pending} className="h-11">
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            {pending ? "Salvando" : "Salvar"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
