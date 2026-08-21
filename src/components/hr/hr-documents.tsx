"use client";

import { useState } from "react";
import { Download, Eye, Search, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import type { HrDocument } from "@/types/hr";

const KIND_STYLE = {
  PDF: "bg-danger/15 text-danger",
  DOCX: "bg-info/15 text-info",
  XLSX: "bg-primary/15 text-primary",
} as const;

export function HrDocumentsPanel({
  documents,
  onUpload,
}: {
  documents: readonly HrDocument[];
  onUpload?: () => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = documents.filter((doc) =>
    doc.name.toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative max-w-md flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar documento"
            aria-label="Buscar documento"
            className="focus-ring h-10 w-full rounded-lg border border-border bg-surface-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted/70 transition-colors hover:border-border-strong"
          />
        </div>
        {onUpload && (
          <button
            type="button"
            onClick={onUpload}
            className="focus-ring flex h-10 items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-4 text-sm font-medium text-primary transition-colors hover:bg-primary/20"
          >
            <Upload className="h-4 w-4" />
            Enviar documento
          </button>
        )}
      </div>

      <div className="space-y-3">
        {filtered.map((doc) => (
          <article
            key={doc.id}
            className="flex items-center gap-4 rounded-xl border border-border bg-surface p-4 transition-colors hover:border-border-strong"
          >
            <span
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[9px] font-bold",
                KIND_STYLE[doc.kind],
              )}
            >
              {doc.kind}
            </span>

            <div className="min-w-0 flex-1">
              <h3 className="truncate text-sm font-medium text-foreground">{doc.name}</h3>
              <p className="mt-0.5 text-xs text-muted">{doc.size}</p>
            </div>

            <div className="flex shrink-0 gap-2">
              <a
                href={doc.filePath ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
                aria-disabled={!doc.filePath}
                className={cn(
                  "focus-ring flex h-9 items-center gap-2 rounded-lg bg-surface-2 px-3 text-xs text-foreground transition-colors hover:bg-surface-3",
                  !doc.filePath && "pointer-events-none opacity-40",
                )}
              >
                <Eye className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Visualizar</span>
              </a>
              <a
                href={doc.filePath ?? "#"}
                download
                aria-disabled={!doc.filePath}
                aria-label={`Baixar ${doc.name}`}
                className={cn(
                  "focus-ring flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary transition-colors hover:bg-primary/25",
                  !doc.filePath && "pointer-events-none opacity-40",
                )}
              >
                <Download className="h-3.5 w-3.5" />
              </a>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
