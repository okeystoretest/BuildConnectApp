"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw, Trash2, TriangleAlert, Upload, VideoOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useRole } from "@/providers/role-provider";
import { useToast } from "@/providers/toast-provider";
import { maxMb } from "@/lib/storage/limits";
import { Progress } from "@/components/ui/progress";
import { removePlatformWelcomeVideo } from "@/lib/platform-welcome-actions";
import { useUploadProgress, uploadPhaseLabel } from "@/lib/use-upload-progress";

// Teto vem de storage/limits, o mesmo que o servidor aplica. Os 500 daqui
// prometiam o que o middleware nunca deixou passar.
const MAX_SIZE_MB = maxMb("video");
const ACCEPTED = ["video/mp4", "video/webm", "video/quicktime", "video/x-matroska"];

export interface InstitutionalVideoProps {
  path: string | null;
  title: string | null;
  /** Quantas pessoas já assistiram — informativo, para quem gerencia. */
  watchedCount: number;
}

/**
 * Vídeo de boas-vindas da PLATAFORMA, na home. Apenas Admin publica ou remove.
 *
 * É a mesma peça que o modal obrigatório da primeira entrada reproduz — um
 * vídeo, um lugar para administrá-lo. Antes esta tela era um placeholder: o
 * botão "Trocar vídeo" esperava 700 ms e não enviava nada.
 *
 * Publicar um vídeo novo APAGA o anterior do disco e faz todo mundo assistir
 * de novo, inclusive quem já tinha visto — por isso o aviso é explícito.
 */
export function InstitutionalVideo({ path, title, watchedCount }: InstitutionalVideoProps) {
  const { can } = useRole();
  const router = useRouter();
  const { success, error: toastError } = useToast();
  const canManage = can("welcomeVideo.manage");

  const inputRef = useRef<HTMLInputElement>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [videoTitle, setVideoTitle] = useState(title ?? "");
  const [error, setError] = useState<string | null>(null);
  const upload = useUploadProgress();
  const saving = upload.busy;
  const [removing, startRemove] = useTransition();

  function pickFile(selected: File | undefined) {
    if (!selected) return;
    if (!ACCEPTED.includes(selected.type)) {
      setError("Formato não suportado. Envie MP4, WebM, MOV ou MKV.");
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

  function closeModal() {
    if (saving) return;
    setModalOpen(false);
    setFile(null);
    setError(null);
    setVideoTitle(title ?? "");
    if (inputRef.current) inputRef.current.value = "";
  }

  function submit() {
    if (!file) {
      setError("Selecione um arquivo de vídeo.");
      return;
    }
    const data = new FormData();
    data.set("title", videoTitle.trim());
    data.set("file", file);

    void (async () => {
      const res = await upload.send("boas-vindas-plataforma", data);
      if (res.ok) {
        success("Vídeo de boas-vindas publicado. Todos vão assisti-lo no próximo acesso.");
        upload.reset();
        closeModal();
        router.refresh();
      } else {
        setError(res.error ?? "Falha ao enviar o vídeo.");
      }
    })();
  }

  function remove() {
    startRemove(async () => {
      const res = await removePlatformWelcomeVideo();
      if (res.ok) {
        success("Vídeo de boas-vindas removido.");
        router.refresh();
      } else {
        toastError(res.error ?? "Falha ao remover o vídeo.");
      }
    });
  }

  return (
    <>
      <div className="relative">
        {path ? (
          <video
            src={path}
            controls
            preload="metadata"
            className="aspect-video w-full rounded-xl border border-border bg-black"
          />
        ) : (
          <div className="bc-stripes flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-xl border border-border bg-surface-2 text-muted">
            <VideoOff className="h-6 w-6" />
            <p className="text-xs">
              {canManage
                ? "Nenhum vídeo de boas-vindas publicado."
                : "Vídeo de boas-vindas ainda não publicado."}
            </p>
          </div>
        )}

        {canManage && (
          <div className="absolute right-3 top-3 flex items-center gap-2">
            {path && (
              <button
                type="button"
                onClick={remove}
                disabled={removing}
                className="focus-ring flex items-center gap-1.5 rounded-lg border border-border bg-background/80 px-2.5 py-1.5 text-xs font-medium text-danger backdrop-blur transition-colors hover:border-border-strong hover:bg-background"
              >
                {removing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
                Remover
              </button>
            )}
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="focus-ring flex items-center gap-1.5 rounded-lg border border-border bg-background/80 px-2.5 py-1.5 text-xs font-medium text-foreground backdrop-blur transition-colors hover:border-border-strong hover:bg-background"
            >
              {path ? <RefreshCw className="h-3.5 w-3.5" /> : <Upload className="h-3.5 w-3.5" />}
              {path ? "Trocar vídeo" : "Enviar vídeo"}
            </button>
          </div>
        )}
      </div>

      {canManage && path && (
        <p className="mt-2 text-xs text-muted">
          {title ? `${title} · ` : ""}
          {watchedCount} {watchedCount === 1 ? "pessoa já assistiu" : "pessoas já assistiram"}
        </p>
      )}

      <Modal
        open={modalOpen}
        onClose={closeModal}
        dismissible={!saving}
        title={path ? "Trocar vídeo de boas-vindas" : "Publicar vídeo de boas-vindas"}
        description="Exibido em tela cheia na primeira entrada de cada pessoa na plataforma."
        className="max-w-lg"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={closeModal} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={submit} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {saving
                ? uploadPhaseLabel(upload.phase, upload.percent)
                : path
                  ? "Substituir vídeo"
                  : "Publicar vídeo"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4 p-6">
          <div>
            <label
              htmlFor="platform-welcome-title"
              className="mb-1.5 block text-sm font-medium text-foreground"
            >
              Título <span className="font-normal text-muted">(opcional)</span>
            </label>
            <Input
              id="platform-welcome-title"
              value={videoTitle}
              onChange={(e) => setVideoTitle(e.target.value)}
              placeholder="Boas-vindas à Build.Connect"
              maxLength={120}
            />
          </div>

          <label
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-6 py-10 text-center transition-colors",
              file
                ? "border-primary/40 bg-primary/[0.04]"
                : "border-border hover:border-border-strong",
            )}
          >
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED.join(",")}
              className="sr-only"
              onChange={(e) => pickFile(e.target.files?.[0])}
            />
            <Upload className="mb-3 h-5 w-5 text-muted" />
            <span className="text-sm font-medium text-foreground">
              {file ? file.name : "Escolher arquivo de vídeo"}
            </span>
            <span className="mt-1 text-xs text-muted">
              {file
                ? `${(file.size / 1024 / 1024).toFixed(1)} MB`
                : `MP4, WebM, MOV ou MKV · até ${MAX_SIZE_MB} MB`}
            </span>
          </label>

          {error && <p className="text-xs text-danger">{error}</p>}

          {saving && (
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

          <div className="flex gap-2.5 rounded-lg border border-warning/30 bg-warning/10 p-3">
            <TriangleAlert className="h-4 w-4 shrink-0 text-warning" />
            <p className="text-xs leading-relaxed text-foreground">
              {path ? (
                <>
                  O vídeo atual será <strong>apagado do servidor</strong> e{" "}
                  <strong>todos voltarão a assistir</strong> — inclusive quem já tinha visto o
                  anterior.
                </>
              ) : (
                <>
                  A partir da publicação, quem entrar na plataforma precisa assistir ao vídeo até o
                  fim para liberar o acesso.
                </>
              )}
            </p>
          </div>
        </div>
      </Modal>
    </>
  );
}
