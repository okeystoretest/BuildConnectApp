"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  Film,
  ImageIcon,
  Loader2,
  RotateCcw,
  Upload,
  X,
} from "lucide-react";
import { cn, formatBytes } from "@/lib/utils";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { MAX_BYTES } from "@/lib/storage/limits";
import {
  MAX_BATCH_FILES,
  titleFromFilename,
  validateBatch,
  runSequentially,
  type BatchLabels,
} from "@/lib/video-batch";
import { captureVideoThumbnail } from "@/lib/video-thumbnail";
import { useUploadProgress, uploadPhaseLabel } from "@/lib/use-upload-progress";

/** As abas de vídeo e a de fotos compartilham este modal; só muda a config. */
export type MediaUploadKind = "video" | "workshop" | "instrucao-video" | "foto";

const PHOTO_ACCEPT = "image/jpeg,image/png,image/webp,image/heic";
const VIDEO_ACCEPT = ".mp4,.webm,.mov,.mkv,video/mp4,video/webm,video/quicktime,video/x-matroska";

const VIDEO_LABELS: BatchLabels = {
  maxBytes: MAX_BYTES.video,
  singular: "vídeo",
  plural: "vídeos",
};

interface KindConfig {
  /** Porta de `api/uploads` que recebe o arquivo. */
  uploadKind: string;
  /** `kind` gravado em Video. Ausente na foto, que tem tabela própria. */
  videoKind?: "VIDEO" | "WORKSHOP" | "INSTRUCAO";
  title: string;
  /** Formatos aceitos, para a linha de apoio do modal. */
  formats: string;
  accept: string;
  labels: BatchLabels;
  /**
   * Foto não tem quadro a capturar: a própria imagem é a prévia, e fica pronta
   * no mesmo instante em que o arquivo é escolhido.
   */
  preview: "video-frame" | "self";
}

const CONFIG: Record<MediaUploadKind, KindConfig> = {
  video: {
    uploadKind: "setor-video",
    videoKind: "VIDEO",
    title: "Enviar vídeos",
    formats: "MP4, WebM, MOV ou MKV",
    accept: VIDEO_ACCEPT,
    labels: VIDEO_LABELS,
    preview: "video-frame",
  },
  workshop: {
    uploadKind: "setor-video",
    videoKind: "WORKSHOP",
    title: "Enviar workshops",
    formats: "MP4, WebM, MOV ou MKV",
    accept: VIDEO_ACCEPT,
    labels: VIDEO_LABELS,
    preview: "video-frame",
  },
  "instrucao-video": {
    uploadKind: "setor-video",
    videoKind: "INSTRUCAO",
    title: "Enviar instruções em vídeo",
    formats: "MP4, WebM, MOV ou MKV",
    accept: VIDEO_ACCEPT,
    labels: VIDEO_LABELS,
    preview: "video-frame",
  },
  foto: {
    uploadKind: "setor-foto",
    title: "Enviar fotos",
    formats: "JPG, PNG, WebP ou HEIC",
    accept: PHOTO_ACCEPT,
    labels: { maxBytes: MAX_BYTES.image, singular: "foto", plural: "fotos" },
    preview: "self",
  },
};

type ItemStatus = "queued" | "sending" | "done" | "error";

interface QueueItem {
  /** Chave estável da linha — o índice muda quando o usuário remove itens. */
  key: string;
  file: File;
  title: string;
  /** URL de objeto da prévia (quadro capturado, ou a própria imagem). */
  previewUrl: string | null;
  /** Miniatura a enviar junto do vídeo. Sempre null na foto. */
  thumbnail: Blob | null;
  /** false enquanto a captura ainda roda. */
  thumbnailReady: boolean;
  status: ItemStatus;
  error: string | null;
}

export interface MediaBatchUploadModalProps {
  slug: string;
  kind: MediaUploadKind;
  open: boolean;
  /**
   * Vitrine: pede Temporada e Coleção, que valem para o LOTE inteiro. Fora das
   * vitrines os campos não existem — em Instruções em Vídeo não há coleção a
   * informar, e um campo vazio e opcional só convidaria a inventar um valor.
   */
  collection?: boolean;
  onClose: () => void;
}

/**
 * Envio de mídia em lote: até MAX_BATCH_FILES arquivos, subindo UM POR VEZ.
 *
 * Sequencial de propósito. Cada arquivo vai na sua própria requisição, e o
 * orçamento de tempo (300 s do `requestTimeout`) vale por requisição — quinze
 * envios em paralelo dividiriam a banda de subida e todos estourariam o
 * relógio juntos. Um de cada vez, cada um tem a banda inteira.
 *
 * As fotos entraram aqui em 09/11/2026, no lugar de um modal próprio de um
 * arquivo só. Não foi economia de linhas: o teto de 15 por operação, a recusa
 * do lote inteiro, a fila sequencial, o retentar por linha e o título que já
 * vem do nome do arquivo são a MESMA regra — e, em dois arquivos, a foto é o
 * que fica para trás quando a regra do vídeo muda.
 *
 * Transcrição e tags NÃO entram aqui: ficam na tela de edição, depois que o
 * conteúdo existe.
 */
export function MediaBatchUploadModal({
  slug,
  kind,
  open,
  collection = false,
  onClose,
}: MediaBatchUploadModalProps) {
  const config = CONFIG[kind];
  const { labels } = config;
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<QueueItem[]>([]);
  const [temporada, setTemporada] = useState("");
  const [colecao, setColecao] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  /** Índice do item em envio, para a barra de progresso ficar na linha certa. */
  const [current, setCurrent] = useState<number | null>(null);
  const upload = useUploadProgress();

  // Libera as URLs de objeto das prévias ao desmontar ou trocar a lista.
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
    setTemporada("");
    setColecao("");
    setError(null);
    setCurrent(null);
    upload.reset();
  }

  function handleClose() {
    if (running) return;
    reset();
    onClose();
  }

  function toItem(file: File): QueueItem {
    const self = config.preview === "self";
    return {
      key: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
      file,
      // O título JÁ VEM PREENCHIDO com o nome do arquivo: trocar é opcional.
      title: titleFromFilename(file.name, self ? "Foto" : "Vídeo"),
      previewUrl: self ? URL.createObjectURL(file) : null,
      thumbnail: null,
      thumbnailReady: self,
      status: "queued",
      error: null,
    };
  }

  function addFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    const chosen = Array.from(list);
    const next = [...items.filter((it) => it.status !== "done"), ...chosen.map(toItem)];
    const problem = validateBatch(
      next.map((it) => ({ name: it.file.name, size: it.file.size })),
      labels,
    );
    if (problem) {
      // Recusa a seleção inteira: as prévias já criadas das novas linhas
      // seriam vazamento de URL de objeto, já que elas não entram na lista.
      for (const item of next) if (!items.includes(item) && item.previewUrl) {
        URL.revokeObjectURL(item.previewUrl);
      }
      setError(problem);
      return;
    }
    setError(null);
    setItems(next);

    if (config.preview === "self") return;

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
    if (config.videoKind) fd.set("kind", config.videoKind);
    fd.set("file", item.file);
    if (thumbnail) fd.set("thumbnailFile", thumbnail, "thumbnail.jpg");
    if (collection) {
      fd.set("temporada", temporada.trim());
      fd.set("colecao", colecao.trim());
    }

    const res = await upload.send(config.uploadKind, fd);
    patch(item.key, {
      status: res.ok ? "done" : "error",
      error: res.ok ? null : (res.error ?? "Falha no envio."),
    });
    return res.ok ? { ok: true } : { ok: false, error: res.error };
  }

  async function submit() {
    const pending = items.filter((it) => it.status !== "done");
    if (pending.length === 0) {
      setError(`Selecione ao menos um${labels.singular === "foto" ? "a" : ""} ${labels.singular}.`);
      return;
    }
    const semTitulo = pending.find((it) => !it.title.trim());
    if (semTitulo) {
      setError(`Informe o título de "${semTitulo.file.name}".`);
      return;
    }
    const problem = validateBatch(
      pending.map((it) => ({ name: it.file.name, size: it.file.size })),
      labels,
    );
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
          ? `1 ${labels.singular} não foi enviad${labels.singular === "foto" ? "a" : "o"}. Veja o motivo na lista e tente de novo.`
          : `${failed} ${labels.plural} não foram enviad${labels.singular === "foto" ? "as" : "os"}. Veja o motivo na lista e tente de novo.`,
      );
    }
  }

  const pendingCount = items.filter((it) => it.status !== "done").length;
  const doneCount = items.length - pendingCount;
  const EmptyPreviewIcon = config.preview === "self" ? ImageIcon : Film;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      dismissible={!running}
      title={config.title}
      description={`Até ${MAX_BATCH_FILES} ${labels.plural} por vez, enviad${labels.singular === "foto" ? "as" : "os"} um a um. ${config.formats}, até ${formatBytes(labels.maxBytes)} cada.`}
      className="max-w-2xl"
      footer={
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted">
            {running && current !== null
              ? `Enviando ${doneCount + 1} de ${items.length} · ${uploadPhaseLabel(upload.phase, upload.percent)}`
              : items.length > 0
                ? `${pendingCount} ${pendingCount === 1 ? labels.singular : labels.plural} na fila`
                : ""}
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={handleClose} disabled={running}>
              Cancelar
            </Button>
            <Button onClick={submit} disabled={running || pendingCount === 0}>
              {running && <Loader2 className="h-4 w-4 animate-spin" />}
              {running
                ? "Enviando…"
                : pendingCount > 1
                  ? `Enviar ${pendingCount} ${labels.plural}`
                  : "Enviar"}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4 p-6">
        {/* Temporada e Coleção valem para o lote inteiro: quem envia as fotos
            de uma coleção envia todas de uma vez, e repetir o mesmo par em
            quinze linhas seria quinze chances de digitar diferente. */}
        {collection && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="lote-temporada">Temporada (opcional)</Label>
              <Input
                id="lote-temporada"
                value={temporada}
                onChange={(e) => setTemporada(e.target.value)}
                disabled={running}
                maxLength={60}
                placeholder="Ex.: Verão"
              />
            </div>
            <div>
              <Label htmlFor="lote-colecao">Coleção (opcional)</Label>
              <Input
                id="lote-colecao"
                value={colecao}
                onChange={(e) => setColecao(e.target.value)}
                disabled={running}
                maxLength={60}
                placeholder="Ex.: Cápsula 1"
              />
            </div>
          </div>
        )}

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
                ? `Selecionar ${labels.plural}`
                : `Adicionar mais ${labels.plural} (${items.length}/${MAX_BATCH_FILES})`}
            </span>
          </span>
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={config.accept}
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
                    <EmptyPreviewIcon className="h-5 w-5 text-muted" aria-label="Sem prévia" />
                  ) : (
                    <Loader2 className="h-4 w-4 animate-spin text-muted" />
                  )}
                </div>

                <div className="min-w-0 flex-1 space-y-1">
                  <Input
                    value={item.title}
                    onChange={(e) => patch(item.key, { title: e.target.value })}
                    disabled={running || item.status === "done"}
                    placeholder={`Título d${labels.singular === "foto" ? "a foto" : "o vídeo"}`}
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
                  {/* `primary`, não `success`: o tema não define `success`, e
                      a classe simplesmente não era gerada — o ícone saía
                      herdando a cor do pai, ao lado de um `text-danger` que
                      funciona. O verde do projeto é `primary`. */}
                  {item.status === "done" && (
                    <CheckCircle2 className="h-4 w-4 text-primary" aria-label="Enviado" />
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
          <li>
            Selecione um ou mais arquivos — o nome do arquivo já vira o título, e trocar é
            opcional.
          </li>
          <li>
            {config.preview === "self"
              ? "Confira as prévias e ajuste os títulos, se quiser."
              : "Ajuste os títulos, se quiser, e confira as miniaturas."}
          </li>
          <li>Clique em Enviar e aguarde: os arquivos sobem um de cada vez.</li>
        </ol>
      </div>
    </Modal>
  );
}
