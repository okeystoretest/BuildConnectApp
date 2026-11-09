"use client";

import { LayoutGrid, List, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export type ViewMode = "grid" | "list";

export interface ContentToolbarProps {
  query: string;
  onQueryChange: (value: string) => void;
  placeholder: string;
  /**
   * Modo de exibição. OPCIONAL: quem não tem duas formas de listar não ganha
   * o seletor. A aba de Fotos é assim — o `PhotoGrid` só sabe desenhar grade,
   * e um botão que acende sem fazer nada é pior do que botão nenhum.
   */
  view?: ViewMode;
  onViewChange?: (view: ViewMode) => void;
  /**
   * Controles extra na MESMA linha da busca, entre ela e o seletor de
   * visualização (os filtros de temporada/coleção/ano da vitrine).
   *
   * Encaixe em vez de prop própria: a barra não precisa saber o que são. Sem
   * ele a linha fica exatamente como era — é o que mantém RH, Motoristas e TI
   * intactos, que usam esta mesma barra sem filtro nenhum.
   */
  children?: React.ReactNode;
}

export function ContentToolbar({
  query,
  onQueryChange,
  placeholder,
  view,
  onViewChange,
  children,
}: ContentToolbarProps) {
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

      {children}

      {view !== undefined && onViewChange && (
        <div
          className={cn(
            "flex items-center gap-1 rounded-lg border border-border bg-surface p-1",
            // Com filtros no meio, o seletor de visualização vai para a direita:
            // busca e filtros à esquerda, modo de exibição na ponta. Sem eles
            // continua colado na busca, como nas outras telas.
            children && "ml-auto",
          )}
        >
          {(["grid", "list"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => onViewChange(mode)}
              aria-label={
                mode === "grid" ? "Visualizar em grade" : "Visualizar em lista"
              }
              aria-pressed={view === mode}
              className={cn(
                "focus-ring rounded-md p-1.5 transition-colors",
                view === mode
                  ? "bg-primary text-primary-foreground"
                  : "text-muted hover:bg-surface-2 hover:text-foreground",
              )}
            >
              {mode === "grid" ? (
                <LayoutGrid className="h-4 w-4" />
              ) : (
                <List className="h-4 w-4" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
