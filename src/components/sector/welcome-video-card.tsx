"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Film, Loader2, Trash2, TriangleAlert, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { useToast } from "@/providers/toast-provider";
import { useRole } from "@/providers/role-provider";
import { cn } from "@/lib/utils";
import { uploadWelcomeVideo, removeWelcomeVideo } from "@/lib/welcome-video-actions";

const MAX_SIZE_MB = 500;
const ACCEPTED = ["video/mp4", "video/webm", "video/quicktime", "video/x-matroska"];

export interface WelcomeVideoCardProps {
  slug: string;
  sectorLabel: string;
  path: string | null;
  title: string | null;
  watchedCount: number;
}

/**
 * Gestão do vídeo de boas-vindas do setor. Visível apenas para quem tem
 * `welcomeVideo.manage` — hoje só o Admin. Para todos os demais, inclusive o
 * Gestor, o vídeo aparece como o modal obrigatório da primeira visita, e mais
 * nada: publicar um vídeo obrigatório para o setor inteiro (e zerar as
 * visualizações de quem já assistiu) é decisão da administração.
 *
 * Fica logo abaixo do cabeçalho da página, antes das abas: é conteúdo do
 * setor inteiro, não de uma aba específica.
 */
export function WelcomeVideoCard({
  slug,
  sectorLabel,
  path,
  title,
  watchedCount,
}: WelcomeVideoCardProps) {
  const { can } = useRole();
  const router = useRouter();
  const { success, error: toastError } = useToast();

  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [videoTitle, setVideoTitle] = useState(title ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();
  const [removing, startRemove] = useTransition();

  if (!can("welcomeVideo.manage")) return null;

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
    setOpen(false);
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
    data.set("slug", slug);
    data.set("title", videoTitle.trim());
    data.set("file", file);

    startSave(async () => {
      const res = await uploadWelcomeVideo(data);
      if (res.ok) {
        success("Vídeo de boas-vindas publicado. Todos do setor vão assisti-lo.");
        closeModal();
        router.refresh();
      } else {
        setError(res.error ?? "Falha ao enviar o vídeo.");
      }
    });
  }

  function remove() {
    startRemove(async () => {
      const res = await removeWelcomeVideo(slug);
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
      <section className="mt-5 rounded-xl border border-border bg-surface p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted">
              <Film className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-foreground">
                Vídeo de boas-vindas do setor
              </h3>
              <p className="mt-0.5 text-xs text-muted">
                {path
                  ? `${title || "Sem título"} · ${watchedCount} ${
                      watchedCount === 1 ? "pessoa já assistiu" : "pessoas já assistiram"
                    }`
                  : "Nenhum vídeo configurado — ninguém é bloqueado ao entrar no setor."}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {path && (
              <Button size="sm" variant="danger" onClick={remove} disabled={removing}>
                {removing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Remover
              </Button>
            )}
            <Button size="sm" variant={path ? "secondary" : "primary"} onClick={() => setOpen(true)}>
              <Upload className="h-4 w-4" />
              {path ? "Trocar vídeo" : "Enviar vídeo"}
            </Button>
          </div>
        </div>

        {path && (
          <video
            src={path}
            controls
            preload="metadata"
            className="mt-4 aspect-video w-full max-w-md rounded-lg border border-border bg-black"
          />
        )}
      </section>

      <Modal
        open={open}
        onClose={closeModal}
        dismissible={!saving}
        title={path ? "Trocar vídeo de boas-vindas" : "Enviar vídeo de boas-vindas"}
        description={`Exibido na primeira visita de cada pessoa a ${sectorLabel}.`}
        className="max-w-lg"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={closeModal} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={submit} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {saving ? "Enviando" : path ? "Substituir vídeo" : "Publicar vídeo"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4 p-6">
          <div>
            <label htmlFor="welcome-title" className="mb-1.5 block text-sm font-medium text-foreground">
              Título <span className="font-normal text-muted">(opcional)</span>
            </label>
            <Input
              id="welcome-title"
              value={videoTitle}
              onChange={(e) => setVideoTitle(e.target.value)}
              placeholder={`Boas-vindas ao ${sectorLabel}`}
              maxLength={120}
            />
          </div>

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

          <div className="flex gap-2.5 rounded-lg border border-warning/30 bg-warning/10 p-3">
            <TriangleAlert className="h-4 w-4 shrink-0 text-warning" />
            <p className="text-xs leading-relaxed text-foreground">
              {path ? (
                <>
                  O vídeo atual será <strong>apagado do servidor</strong> e{" "}
                  <strong>todos do setor voltarão a assistir</strong> — inclusive quem já tinha
                  visto o anterior.
                </>
              ) : (
                <>
                  A partir da publicação, quem entrar no setor pela primeira vez precisa assistir ao
                  vídeo até o fim para acessar o conteúdo.
                </>
              )}
            </p>
          </div>
        </div>
      </Modal>
    </>
  );
}
