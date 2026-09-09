"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Upload } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { MAX_BYTES, validateUploadSizes } from "@/lib/storage/limits";
import { useUploadProgress, uploadPhaseLabel } from "@/lib/use-upload-progress";

/** Configura o modal conforme o tipo de conteúdo enviado. */
type UploadKind = "video" | "workshop" | "instrucao-video" | "documento";

interface KindConfig {
  title: string;
  accept: string;
  needsTitle: boolean;
  /** Anexos da instrução em vídeo: instrução escrita + transcrição. */
  needsAttachments: boolean;
  /** Teto do arquivo principal, conferido AQUI antes de subir um byte. */
  maxBytes: number;
  /** Como o campo principal é citado na mensagem de erro. */
  fileLabel: string;
  /** Qual função a rota /api/uploads executa para este tipo. */
  uploadKind: string;
  prepare: (fd: FormData) => void;
}

const VIDEO_ACCEPT = "video/mp4,video/webm,video/quicktime,video/x-matroska";
const INSTRUCTION_ACCEPT =
  "application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const TRANSCRIPT_ACCEPT = ".txt,.md,.vtt,.srt,text/plain,text/vtt,text/markdown";

const CONFIG: Record<UploadKind, KindConfig> = {
  video: {
    title: "Enviar vídeo",
    accept: VIDEO_ACCEPT,
    needsTitle: true,
    needsAttachments: true,
    maxBytes: MAX_BYTES.video,
    fileLabel: "O vídeo",
    uploadKind: "setor-video",
    prepare: (fd) => fd.set("kind", "VIDEO"),
  },
  workshop: {
    title: "Enviar workshop",
    accept: VIDEO_ACCEPT,
    needsTitle: true,
    needsAttachments: true,
    maxBytes: MAX_BYTES.video,
    fileLabel: "O vídeo",
    uploadKind: "setor-video",
    prepare: (fd) => fd.set("kind", "WORKSHOP"),
  },
  "instrucao-video": {
    title: "Enviar vídeo",
    accept: VIDEO_ACCEPT,
    needsTitle: true,
    needsAttachments: true,
    maxBytes: MAX_BYTES.video,
    fileLabel: "O vídeo",
    uploadKind: "setor-video",
    prepare: (fd) => fd.set("kind", "INSTRUCAO"),
  },
  documento: {
    title: "Enviar documento",
    accept:
      "application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,image/png",
    needsTitle: false,
    needsAttachments: false,
    maxBytes: MAX_BYTES.document,
    fileLabel: "O documento",
    uploadKind: "setor-documento",
    prepare: () => {},
  },
};

/** Seletor de arquivo reutilizado pelos três campos do formulário. */
function FilePicker({
  id,
  label,
  accept,
  file,
  optional,
  onSelect,
}: {
  id: string;
  label?: string;
  accept: string;
  file: File | null;
  optional?: boolean;
  onSelect: (file: File | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div>
      {label && <Label htmlFor={id}>{label}</Label>}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="focus-ring flex h-20 w-full items-center justify-center rounded-xl border border-dashed border-border bg-surface-2 px-3 text-muted transition-colors hover:border-border-strong hover:text-foreground"
      >
        <span className="flex flex-col items-center gap-2 text-center text-xs">
          <Upload className="h-5 w-5" />
          <span className="line-clamp-1 break-all">
            {file ? file.name : optional ? "Selecionar arquivo (opcional)" : "Selecionar arquivo"}
          </span>
        </span>
      </button>
      <input
        id={id}
        ref={inputRef}
        type="file"
        accept={accept}
        className="sr-only"
        onChange={(e) => onSelect(e.target.files?.[0] ?? null)}
      />
    </div>
  );
}

export interface FileUploadModalProps {
  slug: string;
  kind: UploadKind;
  open: boolean;
  onClose: () => void;
}

export function FileUploadModal({ slug, kind, open, onClose }: FileUploadModalProps) {
  const router = useRouter();
  const cfg = CONFIG[kind];
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [instructionFile, setInstructionFile] = useState<File | null>(null);
  const [transcriptFile, setTranscriptFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const upload = useUploadProgress();
  const pending = upload.busy;

  function reset() {
    setTitle("");
    setFile(null);
    setInstructionFile(null);
    setTranscriptFile(null);
    setError(null);
  }

  function handleClose() {
    if (pending) return;
    reset();
    upload.reset();
    onClose();
  }

  function submit() {
    if (cfg.needsTitle && !title.trim()) {
      setError("Informe o título.");
      return;
    }
    if (!file) {
      setError("Selecione um arquivo.");
      return;
    }

    // Tamanho conferido ANTES de subir. O servidor também confere, e continua
    // sendo ele quem manda — mas a checagem dele só acontece depois de receber
    // o arquivo inteiro. Num vídeo de centenas de MB isso são minutos de barra
    // de progresso terminando em "Algo deu errado", porque a requisição morre
    // (teto de corpo, memória ou tempo) antes de a Server Action começar.
    const excedeu = validateUploadSizes([
      { label: cfg.fileLabel, bytes: file.size, max: cfg.maxBytes },
      ...(cfg.needsAttachments && instructionFile
        ? [
            {
              label: "A instrução escrita",
              bytes: instructionFile.size,
              max: MAX_BYTES.instruction,
            },
          ]
        : []),
      ...(cfg.needsAttachments && transcriptFile
        ? [{ label: "A transcrição", bytes: transcriptFile.size, max: MAX_BYTES.transcript }]
        : []),
    ]);
    if (excedeu) {
      setError(excedeu);
      return;
    }

    setError(null);

    void (async () => {
      const fd = new FormData();
      fd.set("slug", slug);
      if (cfg.needsTitle) fd.set("title", title.trim());
      fd.set("file", file);
      if (cfg.needsAttachments) {
        if (instructionFile) fd.set("instructionFile", instructionFile);
        if (transcriptFile) fd.set("transcriptFile", transcriptFile);
      }
      if (kind === "documento") fd.set("name", file.name);
      cfg.prepare(fd);

      const res = await upload.send(cfg.uploadKind, fd);
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
        <h2 className="text-lg font-semibold text-foreground">{cfg.title}</h2>

        <div className="mt-5 space-y-4">
          {cfg.needsTitle && (
            <div>
              <Label htmlFor="up-title">Título</Label>
              <Input
                id="up-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Título do conteúdo"
              />
            </div>
          )}

          <FilePicker
            id="up-file"
            label={cfg.needsAttachments ? "Arquivo de vídeo" : undefined}
            accept={cfg.accept}
            file={file}
            onSelect={(f) => {
              setError(null);
              setFile(f);
            }}
          />

          {cfg.needsAttachments && (
            <>
              <FilePicker
                id="up-instruction"
                label="Instrução Escrita"
                accept={INSTRUCTION_ACCEPT}
                file={instructionFile}
                optional
                onSelect={(f) => {
                  setError(null);
                  setInstructionFile(f);
                }}
              />
              <FilePicker
                id="up-transcript"
                label="Transcrição do Vídeo"
                accept={TRANSCRIPT_ACCEPT}
                file={transcriptFile}
                optional
                onSelect={(f) => {
                  setError(null);
                  setTranscriptFile(f);
                }}
              />
              <p className="text-[11px] text-muted">
                Instrução escrita: PDF, DOC ou DOCX. Transcrição: TXT, MD, VTT ou SRT.
              </p>
            </>
          )}

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
