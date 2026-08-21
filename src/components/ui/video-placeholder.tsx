"use client";

import { Play } from "lucide-react";
import { cn } from "@/lib/utils";

export interface VideoPlaceholderProps {
  caption?: string;
  className?: string;
  onPlay?: () => void;
}

/** Superfície de vídeo do design. Recebe o player real na integração. */
export function VideoPlaceholder({ caption, className, onPlay }: VideoPlaceholderProps) {
  return (
    <button
      type="button"
      onClick={onPlay}
      aria-label={caption ? `Reproduzir: ${caption}` : "Reproduzir vídeo"}
      className={cn(
        "bc-stripes focus-ring group relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-xl border border-border bg-surface-2",
        className,
      )}
    >
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform group-hover:scale-110">
        <Play className="ml-0.5 h-6 w-6 fill-current" />
      </span>
      {caption && (
        <span className="absolute bottom-3 left-3 rounded bg-background/70 px-2 py-1 font-mono text-[11px] text-muted">
          {caption}
        </span>
      )}
    </button>
  );
}
