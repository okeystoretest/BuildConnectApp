"use client";

import { LayoutGrid, List, Search, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRole } from "@/providers/role-provider";

export type ViewMode = "grid" | "list";

export interface ContentToolbarProps {
  query: string;
  onQueryChange: (value: string) => void;
  placeholder: string;
  view: ViewMode;
  onViewChange: (view: ViewMode) => void;
  /** Habilita o botão de filtro; a visibilidade final depende do papel. */
  showFilter?: boolean;
  filtersOpen?: boolean;
  onToggleFilters?: () => void;
}

export function ContentToolbar({
  query,
  onQueryChange,
  placeholder,
  view,
  onViewChange,
  showFilter = false,
  filtersOpen = false,
  onToggleFilters,
}: ContentToolbarProps) {
  const { can } = useRole();
  // Filtro é ferramenta de gestão: Colaborador não vê.
  const canFilter = showFilter && can("content.upload");

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-0 flex-1 sm:max-w-xs">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          className="focus-ring h-10 w-full rounded-lg border border-border bg-surface-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted/70 transition-colors hover:border-border-strong"
        />
      </div>

      <div className="flex items-center gap-1 rounded-lg border border-border bg-surface p-1">
        {(["grid", "list"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => onViewChange(mode)}
            aria-label={mode === "grid" ? "Visualizar em grade" : "Visualizar em lista"}
            aria-pressed={view === mode}
            className={cn(
              "focus-ring rounded-md p-1.5 transition-colors",
              view === mode
                ? "bg-primary text-primary-foreground"
                : "text-muted hover:bg-surface-2 hover:text-foreground",
            )}
          >
            {mode === "grid" ? <LayoutGrid className="h-4 w-4" /> : <List className="h-4 w-4" />}
          </button>
        ))}
      </div>

      {canFilter && (
        <button
          type="button"
          onClick={onToggleFilters}
          aria-pressed={filtersOpen}
          className={cn(
            "focus-ring flex h-10 items-center gap-2 rounded-lg border px-3 text-sm transition-colors",
            filtersOpen
              ? "border-primary bg-primary/10 text-primary"
              : "border-border bg-surface text-muted hover:text-foreground",
          )}
        >
          <SlidersHorizontal className="h-4 w-4" />
          Filtro
        </button>
      )}
    </div>
  );
}
