"use client";

import { Download, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { EditableMediaActions } from "./editable-media-actions";
import type { DocumentItem, FileKind } from "@/types/sector";

const KIND_STYLE: Record<FileKind, string> = {
  PDF: "bg-danger/15 text-danger",
  DOCX: "bg-info/15 text-info",
  XLSX: "bg-primary/15 text-primary",
  PNG: "bg-accent/15 text-accent",
};

export function DocumentGrid({ documents }: { documents: readonly DocumentItem[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {documents.map((doc) => (
        <article key={doc.id} className="relative rounded-xl border border-border bg-surface p-4">
          <EditableMediaActions title={doc.name} tags={doc.tags} />

          <div className="flex items-start gap-3">
            <span
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[9px] font-bold",
                KIND_STYLE[doc.kind],
              )}
            >
              {doc.kind}
            </span>
            <div className="min-w-0 pr-14">
              <h3 className="truncate text-sm font-medium text-foreground">{doc.name}</h3>
              <p className="mt-0.5 text-xs text-muted">{doc.size}</p>
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              className="focus-ring flex h-9 flex-1 items-center justify-center gap-2 rounded-lg bg-surface-2 text-xs text-foreground transition-colors hover:bg-surface-3"
            >
              <Eye className="h-3.5 w-3.5" />
              Visualizar
            </button>
            <button
              type="button"
              aria-label={`Baixar ${doc.name}`}
              className="focus-ring flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary transition-colors hover:bg-primary/25"
            >
              <Download className="h-3.5 w-3.5" />
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
