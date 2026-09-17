"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Play, Captions, MessageSquareText } from "lucide-react";
import { cn } from "@/lib/utils";
import { EditableMediaActions } from "./editable-media-actions";
import type { MediaEditValue } from "./media-edit-modal";
import { VideoModal } from "./video-modal";
import { deleteSectorVideo } from "@/lib/sector-actions";
import { useUploadProgress } from "@/lib/use-upload-progress";
import { useToast } from "@/providers/toast-provider";
import type { VideoItem } from "@/types/sector";

/**
 * Situação de uma Instrução em Vídeo para o usuário. Só leitura: "assistido"
 * não é clique. Vitrines (Coleção, Workshop) não têm regra de conclusão e não
 * mostram selo.
 *
 *  - Responder: chegou ao fim e ainda não respondeu à pergunta de
 *    compreensão — clicar abre o player já com a pergunta. É a resposta que
 *    conclui o vídeo.
 *  - Assistido: respondeu.
 *  - Avaliada: o Gestor já deu a nota à resposta.
 */
function WatchBadge({
  video,
  comprehension,
  onAnswer,
}: {
  video: VideoItem;
  comprehension: boolean;
  onAnswer: () => void;
}) {
  const base =
    "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-medium";

  if (!comprehension) return null;

  if (video.ended && !video.watched && !video.comprehension) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onAnswer();
        }}
        className={cn(
          base,
          "focus-ring border-accent/30 bg-accent/15 text-accent transition-colors hover:bg-accent/25",
        )}
      >
        <MessageSquareText className="h-3 w-3" /> Responder
      </button>
    );
  }
  if (comprehension && video.comprehension === "AVALIADA") {
    return <span className={cn(base, "border-primary/25 bg-primary/15 text-primary")}>✓ Avaliada</span>;
  }
  if (video.watched) {
    return <span className={cn(base, "border-primary/25 bg-primary/15 text-primary")}>✓ Assistido</span>;
  }
  return null;
}

/** Selo de transcrição disponível. */
function TranscriptBadge({ video, className }: { video: VideoItem; className?: string }) {
  if (!video.transcriptText?.trim()) return null;
  return (
    <span className={cn("flex items-center text-muted", className)}>
      <Captions className="h-3.5 w-3.5" aria-label="Transcrição disponível" />
    </span>
  );
}

/** Miniatura do vídeo; sem ela, o placeholder listrado de sempre. */
function Thumbnail({ video, className }: { video: VideoItem; className?: string }) {
  if (!video.thumbnailPath) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={video.thumbnailPath}
      alt=""
      loading="lazy"
      className={cn("absolute inset-0 h-full w-full object-cover", className)}
    />
  );
}

/**
 * Salvar (título, tags, transcrição) e excluir, ligados ao servidor.
 * Compartilhado pelo card e pela linha da lista.
 */
function useVideoAdmin(slug: string, video: VideoItem) {
  const router = useRouter();
  const toast = useToast();
  const upload = useUploadProgress();
  const [editing, setEditing] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleting, startDelete] = useTransition();

  async function save(value: MediaEditValue) {
    setSaveError(null);
    const fd = new FormData();
    fd.set("slug", slug);
    fd.set("id", video.id);
    fd.set("title", value.title);
    for (const tag of value.tags) fd.append("tags", tag);
    fd.set("transcriptMode", value.transcriptMode ?? "keep");
    if (value.transcriptMode === "replace" && value.transcriptFile) {
      fd.set("transcriptFile", value.transcriptFile);
    }
    const res = await upload.send("setor-video-editar", fd);
    upload.reset();
    if (res.ok) {
      setEditing(false);
      router.refresh();
    } else {
      setSaveError(res.error ?? "Falha ao salvar.");
    }
  }

  function remove() {
    startDelete(async () => {
      const res = await deleteSectorVideo({ slug, id: video.id });
      if (res.ok) {
        toast.success("Vídeo excluído.");
        router.refresh();
      } else {
        toast.error(res.error ?? "Falha ao excluir o vídeo.");
      }
    });
  }

  return {
    title: video.title,
    tags: video.tags,
    transcript: { hasCurrent: Boolean(video.transcriptText?.trim()) },
    saving: upload.busy,
    saveError,
    editing,
    onEditingChange: (open: boolean) => {
      setEditing(open);
      if (!open) setSaveError(null);
    },
    onSave: (value: MediaEditValue) => void save(value),
    onDelete: remove,
    deleting,
  };
}

export interface VideoCardProps {
  slug: string;
  video: VideoItem;
  /** Tags em uso no setor, oferecidas como sugestão na edição. */
  suggestions?: readonly string[];
  /**
   * Instruções em Vídeo: ao concluir, pergunta de compreensão. As vitrines
   * (Coleção, Workshop) não passam — só rastreiam a conclusão.
   */
  comprehension?: boolean;
}

/** Abrir/fechar o player, com a variante "abrir já na pergunta". */
function usePlayer() {
  const router = useRouter();
  const [state, setState] = useState<{ open: boolean; askNow: boolean }>({
    open: false,
    askNow: false,
  });
  return {
    open: state.open,
    askNow: state.askNow,
    play: () => setState({ open: true, askNow: false }),
    answer: () => setState({ open: true, askNow: true }),
    close: () => setState({ open: false, askNow: false }),
    // Progresso ou resposta gravados: o selo do card vem do servidor.
    changed: () => router.refresh(),
  };
}

export function VideoCard({ slug, video, suggestions, comprehension = false }: VideoCardProps) {
  const player = usePlayer();
  const { deleting, ...admin } = useVideoAdmin(slug, video);

  return (
    <>
      <article
        className={cn(
          "group relative overflow-hidden rounded-xl border border-border bg-surface transition-colors hover:border-border-strong",
          deleting && "pointer-events-none opacity-50",
        )}
      >
        <EditableMediaActions {...admin} suggestions={suggestions} />

        {/* Irmão do botão de play, não filho: <button> dentro de <button> é
            HTML inválido e o React avisa no console. */}
        <span className="absolute left-3 top-3 z-10">
          <WatchBadge video={video} comprehension={comprehension} onAnswer={player.answer} />
        </span>

        <button
          type="button"
          onClick={player.play}
          aria-label={`Reproduzir: ${video.title}`}
          className="bc-stripes focus-ring relative flex aspect-video w-full items-center justify-center overflow-hidden bg-surface-2"
        >
          <Thumbnail video={video} className="transition-transform group-hover:scale-[1.03]" />

          <span className="relative z-10 flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform group-hover:scale-110">
            <Play className="ml-0.5 h-5 w-5 fill-current" />
          </span>
        </button>

        <div className="flex items-center justify-between gap-2 p-3.5">
          <h3 className="truncate text-sm font-medium text-foreground">{video.title}</h3>
          <TranscriptBadge video={video} className="shrink-0" />
        </div>
      </article>

      <VideoModal
        video={video}
        open={player.open}
        askNow={player.askNow}
        comprehension={comprehension}
        onClose={player.close}
        onChanged={player.changed}
      />
    </>
  );
}

export function VideoListRow({ slug, video, suggestions, comprehension = false }: VideoCardProps) {
  const player = usePlayer();
  const { deleting, ...admin } = useVideoAdmin(slug, video);

  return (
    <>
      <article
        className={cn(
          "relative flex items-center gap-4 rounded-xl border border-border bg-surface p-3 pr-24 transition-colors hover:border-border-strong",
          deleting && "pointer-events-none opacity-50",
        )}
      >
        <button
          type="button"
          onClick={player.play}
          aria-label={`Reproduzir: ${video.title}`}
          className="bc-stripes focus-ring relative flex h-12 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-2"
        >
          <Thumbnail video={video} />
          <Play className="relative z-10 h-4 w-4 fill-primary text-primary drop-shadow" />
        </button>

        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-medium text-foreground">{video.title}</h3>
          <TranscriptBadge video={video} className="mt-1" />
        </div>

        <WatchBadge video={video} comprehension={comprehension} onAnswer={player.answer} />

        <EditableMediaActions
          {...admin}
          suggestions={suggestions}
          className="!top-1/2 !-translate-y-1/2 !bg-transparent"
        />
      </article>

      <VideoModal
        video={video}
        open={player.open}
        askNow={player.askNow}
        comprehension={comprehension}
        onClose={player.close}
        onChanged={player.changed}
      />
    </>
  );
}
