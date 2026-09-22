"use client";

import { AlertTriangle, FileText, PlayCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { rejectionLevel } from "@/lib/video-comprehension";
import { PendingItemPlayer, usePendingPlayer } from "./pending-item-player";
import type { PendingCategory, PendingItem } from "@/lib/pending-content";

const REDO_MESSAGE = "Que tal rever com calma? Assista ao vídeo de novo e responda.";

function ItemRow({
  item,
  onPlay,
  playing,
  onClose,
}: {
  item: PendingItem;
  onPlay: () => void;
  playing: boolean;
  onClose: () => void;
}) {
  const isVideo = item.kind === "VIDEO";
  const level = rejectionLevel(item.rejections);

  /*
   * Cor NUNCA sozinha (WCAG 1.4.1): junto com o âmbar vão o ícone de alerta,
   * o selo "Refazer" e, no nível 2, a frase abaixo. Quem não distingue as
   * cores continua recebendo o recado.
   */
  const tone =
    level === 2
      ? "border-danger/60 bg-danger/10 hover:border-danger"
      : level === 1
        ? "border-warning/60 bg-warning/10 hover:border-warning"
        : "border-border bg-surface hover:border-border-strong";

  function activate() {
    if (!item.filePath) return;
    // Vídeo abre o player aqui mesmo; documento vai para a aba nova, o mesmo
    // comportamento da vitrine.
    if (isVideo) return onPlay();
    window.open(item.filePath, "_blank", "noopener,noreferrer");
  }

  return (
    <div>
      <button
        type="button"
        onClick={activate}
        disabled={!item.filePath}
        aria-label={
          level > 0 ? `${item.title} — reprovado, assistir novamente` : `${item.title} — abrir`
        }
        className={cn(
          "focus-ring flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors",
          tone,
          !item.filePath && "cursor-default opacity-60",
        )}
      >
        <span
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
            level > 0
              ? "bg-warning/20 text-warning"
              : isVideo
                ? "bg-primary/15 text-primary"
                : "bg-info/15 text-info",
          )}
        >
          {level > 0 ? (
            <AlertTriangle className="h-4 w-4" />
          ) : isVideo ? (
            <PlayCircle className="h-4 w-4" />
          ) : (
            <FileText className="h-4 w-4" />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <h4 className="truncate text-sm font-medium text-foreground">{item.title}</h4>
          <p className="truncate text-xs text-muted">
            {item.sector} · {item.meta}
          </p>
        </div>

        {level > 0 ? (
          <Badge tone={level === 2 ? "danger" : "warning"} className="shrink-0">
            Refazer
          </Badge>
        ) : (
          <Badge tone={isVideo ? "primary" : "info"} className="shrink-0">
            {isVideo ? "Vídeo" : "Documento"}
          </Badge>
        )}
      </button>

      {level === 2 && <p className="mt-1.5 px-3 text-xs text-muted">{REDO_MESSAGE}</p>}

      {isVideo && <PendingItemPlayer item={item} open={playing} onClose={onClose} />}
    </div>
  );
}

export function PendingContent({ groups }: { groups: readonly PendingCategory[] }) {
  const player = usePendingPlayer();
  const total = groups.reduce((sum, group) => sum + group.items.length, 0);

  // Reprovados vêm primeiro, num grupo próprio: um vídeo a refazer perdido no
  // meio de quarenta pendências não é sinalização.
  const redo = groups.flatMap((g) => g.items.filter((i) => i.rejections > 0));
  const rest = groups
    .map((g) => ({ ...g, items: g.items.filter((i) => i.rejections === 0) }))
    .filter((g) => g.items.length > 0);

  function row(item: PendingItem) {
    return (
      <ItemRow
        key={item.id}
        item={item}
        playing={player.openId === item.id}
        onPlay={() => player.open(item.id)}
        onClose={player.close}
      />
    );
  }

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Pendências por categoria</h3>
        <span className="text-xs text-muted">{total} itens a concluir</span>
      </div>

      <div className="space-y-6">
        {redo.length > 0 && (
          <div>
            <div className="mb-2.5 flex items-center gap-2">
              <h4 className="text-[11px] font-semibold uppercase tracking-widest text-warning">
                Refazer
              </h4>
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-warning/20 px-1.5 text-[10px] font-medium text-warning">
                {redo.length}
              </span>
            </div>
            <div className="space-y-2">{redo.map(row)}</div>
          </div>
        )}

        {rest.map((group) => (
          <div key={group.category}>
            <div className="mb-2.5 flex items-center gap-2">
              <h4 className="text-[11px] font-semibold uppercase tracking-widest text-muted">
                {group.category}
              </h4>
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-surface-3 px-1.5 text-[10px] font-medium text-muted">
                {group.items.length}
              </span>
            </div>
            <div className="space-y-2">{group.items.map(row)}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
