"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Play, Loader2, FileText, Captions } from "lucide-react";
import { cn } from "@/lib/utils";
import { EditableMediaActions } from "./editable-media-actions";
import { VideoModal } from "./video-modal";
import { setContentProgress } from "@/lib/sector-actions";
import type { VideoItem } from "@/types/sector";

/** Badge de status que também alterna "assistido" ao ser clicado. */
function WatchToggle({ videoId, watched }: { videoId: string; watched: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function toggle(e: React.MouseEvent) {
    e.stopPropagation();
    start(async () => {
      const res = await setContentProgress({ type: "video", id: videoId, done: !watched });
      if (res.ok) router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-label={watched ? "Marcar como não assistido" : "Marcar como assistido"}
      className={cn(
        "focus-ring inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-medium transition-colors",
        watched
          ? "border-primary/25 bg-primary/15 text-primary hover:bg-primary/25"
          : "border-border bg-surface-3 text-muted hover:text-foreground",
      )}
    >
      {pending && <Loader2 className="h-3 w-3 animate-spin" />}
      {watched ? "✓ Assistido" : "Marcar assistido"}
    </button>
  );
}

/** Selos do conteúdo auxiliar já disponível no vídeo. */
function AttachmentBadges({ video, className }: { video: VideoItem; className?: string }) {
  const hasTranscript = Boolean(video.transcriptText?.trim());
  const hasInstruction = Boolean(video.instructionPath);
  if (!hasTranscript && !hasInstruction) return null;

  return (
    <span className={cn("flex items-center gap-1.5 text-muted", className)}>
      {hasTranscript && <Captions className="h-3.5 w-3.5" aria-label="Transcrição disponível" />}
      {hasInstruction && (
        <FileText className="h-3.5 w-3.5" aria-label="Instrução escrita disponível" />
      )}
    </span>
  );
}

export function VideoCard({ video }: { video: VideoItem }) {
  const [playing, setPlaying] = useState(false);

  return (
    <>
      <article className="group relative overflow-hidden rounded-xl border border-border bg-surface transition-colors hover:border-border-strong">
        <EditableMediaActions title={video.title} tags={video.tags} />

        <button
          type="button"
          onClick={() => setPlaying(true)}
          aria-label={`Reproduzir: ${video.title}`}
          className="bc-stripes focus-ring relative flex aspect-video w-full items-center justify-center bg-surface-2"
        >
          <span className="absolute left-3 top-3">
            <WatchToggle videoId={video.id} watched={video.watched} />
          </span>

          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform group-hover:scale-110">
            <Play className="ml-0.5 h-5 w-5 fill-current" />
          </span>
        </button>

        <div className="flex items-center justify-between gap-2 p-3.5">
          <h3 className="truncate text-sm font-medium text-foreground">{video.title}</h3>
          <AttachmentBadges video={video} className="shrink-0" />
        </div>
      </article>

      <VideoModal video={video} open={playing} onClose={() => setPlaying(false)} />
    </>
  );
}

export function VideoListRow({ video }: { video: VideoItem }) {
  const [playing, setPlaying] = useState(false);

  return (
    <>
      <article className="relative flex items-center gap-4 rounded-xl border border-border bg-surface p-3 pr-24 transition-colors hover:border-border-strong">
        <button
          type="button"
          onClick={() => setPlaying(true)}
          aria-label={`Reproduzir: ${video.title}`}
          className="bc-stripes focus-ring flex h-12 w-20 shrink-0 items-center justify-center rounded-lg bg-surface-2"
        >
          <Play className="h-4 w-4 fill-primary text-primary" />
        </button>

        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-medium text-foreground">{video.title}</h3>
          <AttachmentBadges video={video} className="mt-1" />
        </div>

        <WatchToggle videoId={video.id} watched={video.watched} />

        <EditableMediaActions
          title={video.title}
          tags={video.tags}
          className="!top-1/2 !-translate-y-1/2 !bg-transparent"
        />
      </article>

      <VideoModal video={video} open={playing} onClose={() => setPlaying(false)} />
    </>
  );
}
