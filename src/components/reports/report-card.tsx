"use client";

import { Archive, CalendarDays, Eye, Paperclip, UserRound } from "lucide-react";
import { cn, initials } from "@/lib/utils";
import { useArchiveCountdown } from "@/lib/use-archive-countdown";
import type { ReportItem } from "@/types/report";

export interface ReportCardProps {
  report: ReportItem;
  dragging: boolean;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onOpen: (report: ReportItem) => void;
}

/** Primeira linha do relato, o suficiente para reconhecer o caso no quadro. */
function summary(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > 120 ? `${flat.slice(0, 120)}…` : flat;
}

/**
 * Card do quadro de denúncias.
 *
 * Deliberadamente sem botão de excluir: denúncia não se apaga. A única ação
 * destrutiva possível seria essa, e ela não existe — nem aqui, nem no
 * servidor.
 *
 * O denunciante não aparece porque não existe: o canal é anônimo. O card
 * mostra a quem a denúncia se destina.
 */
export function ReportCard({
  report,
  dragging,
  onDragStart,
  onDragEnd,
  onOpen,
}: ReportCardProps) {
  const countdown = useArchiveCountdown(
    report.status === "ENCERRADA" ? report.closedAt : undefined,
  );

  return (
    <article
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", report.id);
        onDragStart(report.id);
      }}
      onDragEnd={onDragEnd}
      className={cn(
        "cursor-grab rounded-xl border border-border bg-surface p-3.5 transition-all active:cursor-grabbing",
        dragging ? "opacity-40" : "hover:border-border-strong",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-mono text-[11px] text-muted">{report.code}</span>
        {report.attachments.length > 0 && (
          <span className="flex shrink-0 items-center gap-1 text-[10px] text-muted">
            <Paperclip className="h-3 w-3" />
            {report.attachments.length}
          </span>
        )}
      </div>

      <div className="mt-2.5 flex items-center gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-danger/15 text-[9px] font-semibold text-danger">
          {initials(report.targetName)}
        </span>
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-foreground">{report.targetName}</p>
          <p className="flex items-center gap-1 text-[10px] text-muted">
            <UserRound className="h-2.5 w-2.5" />
            Destinatário
          </p>
        </div>
      </div>

      <p className="mt-2.5 line-clamp-3 text-xs leading-snug text-muted">
        {summary(report.description)}
      </p>

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-2.5">
        <span className="flex items-center gap-1.5 text-[10px] text-muted">
          <CalendarDays className="h-3 w-3" />
          {report.createdLabel} · {report.timeLabel}
        </span>
        <button
          type="button"
          onClick={() => onOpen(report)}
          className="focus-ring flex items-center gap-1 rounded-md bg-surface-2 px-2 py-1 text-[10px] text-muted transition-colors hover:text-foreground"
        >
          <Eye className="h-3 w-3" />
          Detalhes
        </button>
      </div>

      {countdown && (
        <p className="mt-2 flex items-center gap-1.5 rounded-lg bg-surface-2 px-2 py-1.5 text-[10px] text-muted">
          <Archive className="h-3 w-3 shrink-0" />
          {countdown} · depois fica no Histórico
        </p>
      )}
    </article>
  );
}
