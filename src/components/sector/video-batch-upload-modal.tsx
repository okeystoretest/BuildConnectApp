"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Film, Loader2, RotateCcw, Upload, X } from "lucide-react";
import { cn, formatBytes } from "@/lib/utils";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { maxMb } from "@/lib/storage/limits";
import { MAX_BATCH_FILES, titleFromFilename, validateBatch, runSequentially } from "@/lib/video-batch";
import { captureVideoThumbnail } from "@/lib/video-thumbnail";
import { useUploadProgress, uploadPhaseLabel } from "@/lib/use-upload-progress";

/** As três abas de vídeo compartilham este modal; só muda o `kind` gravado. */
export type VideoUploadKind = "video" | "workshop" | "instrucao-video";

const KIND_VALUE: Record<VideoUploadKind, "VIDEO" | "WORKSHOP" | "INSTRUCAO"> = {
  video: "VIDEO",
  workshop: "WORKSHOP",
  "instrucao-video": "INSTRUCAO",
};

const TITLE: Record<VideoUploadKind, string> = {
  video: "Enviar vídeos",
  workshop: "Enviar workshops",
  "instrucao-video": "Enviar instruções em vídeo",
};

const VIDEO_ACCEPT = ".mp4,.webm,.mov,.mkv,video/mp4,video/webm,video/quicktime,video/x-matroska";

type ItemStatus = "queued" | "sending" | "done" | "error";

interface QueueItem {
  /** Chave estável da linha — o índice muda quando o usuário remove itens. */
  key: string;
  file: File;
  title: string;
  /** URL de objeto da miniatura capturada, para a pré-visualização na linha. */
  previewUrl: string | null;
  thumbnail: Blob | null;
  /** null enquanto a captura ainda roda. */
  thumbnailReady: boolean;
  status: ItemStatus;
  error: string | null;
}

export interface VideoBatchUploadModalProps {
  slug: string;
  kind: VideoUploadKind;
  open: boolean;
  onClose: () => void;
}

/**
 * Envio de vídeos em lote: até MAX_BATCH_FILES arquivos, subindo UM POR VEZ.
 *
 * Sequencial de propósito. Cada vídeo vai na sua própria requisição, e o
 * orçamento de tempo (300 s do `requestTimeout`) vale por requisição — quinze
 * envios em paralelo dividiriam a banda de subida e todos estourariam o
 * relógio juntos. Um de cada vez, cada um tem a banda inteira.
 *
 * Transcrição e filtros NÃO entram aqui: ficam na tela de edição do vídeo,
 * depois que ele existe.
 */
export function VideoBatchUploadModal({ slug, kind, open, onClose }: VideoBatchUploadModalProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<QueueItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  /** Índice do item em envio, para a barra de progresso ficar na linha certa. */
  const [current, setCurrent] = useState<number | null>(null);
  const upload = useUploadProgress();

  // Libera as URLs de objeto das miniaturas ao desmontar ou trocar a lista.
  useEffect(() => {
    return () => {
      for (const item of items) if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function patch(key: string, changes: Partial<QueueItem>) {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...changes } : it)));
  }

  function reset() {
    for (const item of items) if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    setItems([]);
    setError(null);
    setCurrent(null);
    upload.reset();
  }

  function handleClose() {
    if (running) return;
    reset();
    onClose();
  }

  function addFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    const chosen = Array.from(list);
    const next = [...items.filter((it) => it.status !== "done"), ...chosen.map(toItem)];
    const problem = validateBatch(next.map((it) => ({ name: it.file.name, size: it.file.size })));
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setItems(next);

    // A captura roda em segundo plano, uma por vez, para não abrir quinze
    // decodificadores de vídeo ao mesmo tempo no navegador.
    void (async () => {
      for (const item of next) {
        if (item.thumbnailReady) continue;
        const blob = await captureVideoThumbnail(item.file);
        patch(item.key, {
          thumbnail: blob,
          previewUrl: blob ? URL.createObjectURL(blob) : null,
          thumbnailReady: true,
        });
      }
    })();
  }

  function toItem(file: File): QueueItem {
    return {
      key: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
      file,
      title: titleFromFilename(file.name),
      previewUrl: null,
      thumbnail: null,
      thumbnailReady: false,
      status: "queued",
      error: null,
    };
  }

  function remove(key: string) {
    const item = items.find((it) => it.key === key);
    if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
    setItems((prev) => prev.filter((it) => it.key !== key));
  }

  // `sendOne` precisa ler o estado mais novo dentro do laço de espera.
  const itemsRef = useRef(items);
  itemsRef.current = items;

  async function sendOne(item: QueueItem, index: number) {
    // A miniatura pode ainda estar sendo capturada quando o usuário clica em
    // Enviar; espera um pouco por ela antes de desistir e subir sem.
    let thumbnail = item.thumbnail;
    if (!item.thumbnailReady) {
      const started = Date.now();
      while (Date.now() - started < 8000) {
        await new Promise((r) => setTimeout(r, 150));
        const fresh = itemsRef.current.find((it) => it.key === item.key);
        if (fresh?.thumbnailReady) {
          thumbnail = fresh.thumbnail;
          break;
        }
      }
    }

    setCurrent(index);
    patch(item.key, { status: "sending", error: null });

    const fd = new FormData();
    fd.set("slug", slug);
    fd.set("title", item.title.trim());
    fd.set("kind", KIND_VALUE[kind]);
    fd.set("file", item.file);
    if (thumbnail) fd.set("thumbnailFile", thumbnail, "thumbnail.jpg");

    const res = await upload.send("setor-video", fd);
    patch(item.key, {
      status: res.ok ? "done" : "error",
      error: res.ok ? null : (res.error ?? "Falha no envio."),
    });
    return res.ok ? { ok: true } : { ok: false, error: res.error };
  }

  async function submit() {
    const pending = items.filter((it) => it.status !== "done");
    if (pending.length === 0) {
      setError("Selecione ao menos um vídeo.");
      return;
    }
    const semTitulo = pending.find((it) => !it.title.trim());
    if (semTitulo) {
      setError(`Informe o título de "${semTitulo.file.name}".`);
      return;
    }
    const problem = validateBatch(pending.map((it) => ({ name: it.file.name, size: it.file.size })));
    if (problem) {
      setError(problem);
      return;
    }

    setError(null);
    setRunning(true);
    const results = await runSequentially(pending, (item) =>
      sendOne(item, items.findIndex((it) => it.key === item.key)),
    );
    setRunning(false);
    setCurrent(null);
    upload.reset();

    const failed = results.filter((r) => !r.ok).length;
    if (failed === 0) {
      reset();
      onClose();
      router.refresh();
    } else {
      // Os que subiram já estão no setor; os que falharam ficam na lista
      // com o erro e o botão de tentar de novo.
      router.refresh();
      setError(
        failed === 1
          ? "1 vídeo não foi enviado. Veja o motivo na lista e tente de novo."
          : `${failed} vídeos não foram enviados. Veja o motivo na lista e tente de novo.`,
      );
    }
  }

  const pendingCount = items.filter((it) => it.status !== "done").length;
  const doneCount = items.length - pendingCount;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      dismissible={!running}
      title={TITLE[kind]}
      description={`Até ${MAX_BATCH_FILES} vídeos por vez, enviados um a um. MP4, WebM, MOV ou MKV, até ${maxMb("video")} MB cada.`}
      className="max-w-2xl"
      footer={
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted">
            {running && current !== null
              ? `Enviando ${doneCount + 1} de ${items.length} · ${uploadPhaseLabel(upload.phase, upload.percent)}`
              : items.length > 0
                ? `${pendingCount} ${pendingCount === 1 ? "vídeo" : "vídeos"} na fila`
                : ""}
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={handleClose} disabled={running}>
              Cancelar
            </Button>
            <Button onClick={submit} disabled={running || pendingCount === 0}>
              {running && <Loader2 className="h-4 w-4 animate-spin" />}
              {running ? "Enviando…" : pendingCount > 1 ? `Enviar ${pendingCount} vídeos` : "Enviar"}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4 p-6">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={running}
          className="focus-ring flex h-24 w-full items-center justify-center rounded-xl border border-dashed border-border bg-surface-2 px-3 text-muted transition-colors hover:border-border-strong hover:text-foreground disabled:opacity-60"
        >
          <span className="flex flex-col items-center gap-2 text-center text-xs">
            <Upload className="h-5 w-5" />
            <span>
              {items.length === 0
                ? "Selecionar vídeos"
                : `Adicionar mais vídeos (${items.length}/${MAX_BATCH_FILES})`}
            </span>
          </span>
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={VIDEO_ACCEPT}
          multiple
          className="sr-only"
          onChange={(e) => {
            addFiles(e.target.files);
            // Permite escolher o mesmo arquivo de novo depois de removê-lo.
            e.target.value = "";
          }}
        />

        {items.length > 0 && (
          <ul className="space-y-2">
            {items.map((item, index) => (
              <li
                key={item.key}
                className={cn(
                  "flex items-center gap-3 rounded-xl border border-border bg-surface p-2.5",
                  item.status === "error" && "border-danger/40",
                )}
              >
                <div className="bc-stripes flex h-14 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-2">
                  {item.previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.previewUrl} alt="" className="h-full w-full object-cover" />
                  ) : item.thumbnailReady ? (
                    <Film className="h-5 w-5 text-muted" aria-label="Sem miniatura" />
                  ) : (
                    <Loader2 className="h-4 w-4 animate-spin text-muted" />
                  )}
                </div>

                <div className="min-w-0 flex-1 space-y-1">
                  <Input
                    value={item.title}
                    onChange={(e) => patch(item.key, { title: e.target.value })}
                    disabled={running || item.status === "done"}
                    placeholder="Título do vídeo"
                    aria-label={`Título de ${item.file.name}`}
                    className="h-9"
                  />
                  <div className="flex items-center gap-2 text-[11px] text-muted">
                    <span className="truncate">{item.file.name}</span>
                    <span className="shrink-0">· {formatBytes(item.file.size)}</span>
                  </div>
                  {item.status === "sending" && current === index && (
                    <Progress
                      value={upload.phase === "processing" ? 100 : upload.percent}
                      tone="primary"
                      label={`Progresso de ${item.file.name}`}
                    />
                  )}
                  {item.status === "error" && item.error && (
                    <p className="text-[11px] text-danger">{item.error}</p>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  {item.status === "done" && (
                    <CheckCircle2 className="h-4 w-4 text-success" aria-label="Enviado" />
                  )}
                  {item.status === "error" && (
                    <AlertCircle className="h-4 w-4 text-danger" aria-label="Falhou" />
                  )}
                  {item.status === "error" && !running && (
                    <button
                      type="button"
                      onClick={() => patch(item.key, { status: "queued", error: null })}
                      aria-label={`Tentar de novo: ${item.file.name}`}
                      title="Tentar de novo"
                      className="focus-ring flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {item.status !== "done" && item.status !== "sending" && !running && (
                    <button
                      type="button"
                      onClick={() => remove(item.key)}
                      aria-label={`Remover ${item.file.name}`}
                      className="focus-ring flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-danger"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {error && <p className="text-xs text-danger">{error}</p>}

        <ol className="list-decimal space-y-0.5 pl-4 text-[11px] text-muted">
          <li>Selecione um ou mais vídeos — o nome do arquivo vira o título.</li>
          <li>Ajuste os títulos, se quiser, e confira as miniaturas.</li>
          <li>Clique em Enviar e aguarde: os vídeos sobem um de cada vez.</li>
        </ol>
      </div>
    </Modal>
  );
}
