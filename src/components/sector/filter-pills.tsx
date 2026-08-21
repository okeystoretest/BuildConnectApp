"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FilterPillsProps {
  filters: readonly string[];
  onChange: (filters: readonly string[]) => void;
  active: readonly string[];
  onToggle: (filter: string) => void;
  /** Criação e remoção só aparecem para quem pode gerenciar. */
  canManage?: boolean;
}

/**
 * Filtros exibidos como pílulas abaixo da busca, preenchendo
 * horizontalmente. Criar e remover é restrito a Gestor/Admin.
 */
export function FilterPills({
  filters,
  onChange,
  active,
  onToggle,
  canManage = false,
}: FilterPillsProps) {
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState("");

  function commit() {
    const value = draft.trim();
    if (!value) {
      setCreating(false);
      setDraft("");
      return;
    }
    if (!filters.some((f) => f.toLowerCase() === value.toLowerCase())) {
      onChange([...filters, value]);
    }
    setDraft("");
    setCreating(false);
  }

  function remove(filter: string) {
    onChange(filters.filter((f) => f !== filter));
    if (active.includes(filter)) onToggle(filter);
  }

  if (filters.length === 0 && !canManage) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {filters.map((filter) => {
        const selected = active.includes(filter);
        return (
          <span
            key={filter}
            className={cn(
              "inline-flex items-center rounded-full border text-xs font-medium transition-colors",
              selected
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-surface-2 text-muted hover:border-border-strong hover:text-foreground",
            )}
          >
            <button
              type="button"
              onClick={() => onToggle(filter)}
              aria-pressed={selected}
              className="focus-ring rounded-full py-1.5 pl-3 pr-2"
            >
              {filter}
            </button>
            {canManage && (
              <button
                type="button"
                onClick={() => remove(filter)}
                aria-label={`Remover filtro ${filter}`}
                className="focus-ring rounded-full py-1.5 pr-2.5 text-muted transition-colors hover:text-danger"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </span>
        );
      })}

      {canManage &&
        (creating ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") {
                setDraft("");
                setCreating(false);
              }
            }}
            placeholder="Nome do filtro"
            aria-label="Nome do novo filtro"
            className="focus-ring h-8 w-36 rounded-full border border-border bg-surface-2 px-3 text-xs text-foreground placeholder:text-muted/70"
          />
        ) : (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="focus-ring inline-flex items-center gap-1 rounded-full border border-dashed border-border px-3 py-1.5 text-xs text-muted transition-colors hover:border-border-strong hover:text-foreground"
          >
            <Plus className="h-3 w-3" />
            Novo filtro
          </button>
        ))}
    </div>
  );
}
