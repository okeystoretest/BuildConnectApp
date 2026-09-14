"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Page } from "@/lib/paginate";

export interface PaginationProps {
  page: Page<unknown>;
  onChange: (page: number) => void;
  /** Nome do item no contador ("usuários" → "1–10 de 37 usuários"). */
  noun?: string;
  className?: string;
}

/** Rodapé de paginação: contador à esquerda, setas e números à direita. */
export function Pagination({ page, onChange, noun, className }: PaginationProps) {
  if (page.pages <= 1) return null;

  const numbers = Array.from({ length: page.pages }, (_, i) => i + 1);

  return (
    <nav
      aria-label="Paginação"
      className={cn("flex flex-wrap items-center justify-between gap-3", className)}
    >
      <p className="text-xs text-muted">
        {page.from}–{page.to} de {page.total}
        {noun ? ` ${noun}` : ""}
      </p>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onChange(page.page - 1)}
          disabled={page.page === 1}
          aria-label="Página anterior"
          className="focus-ring flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        {numbers.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            aria-current={n === page.page ? "page" : undefined}
            className={cn(
              "focus-ring h-8 min-w-8 rounded-lg px-2 text-xs transition-colors",
              n === page.page
                ? "bg-primary font-semibold text-primary-foreground"
                : "text-muted hover:text-foreground",
            )}
          >
            {n}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onChange(page.page + 1)}
          disabled={page.page === page.pages}
          aria-label="Próxima página"
          className="focus-ring flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </nav>
  );
}
