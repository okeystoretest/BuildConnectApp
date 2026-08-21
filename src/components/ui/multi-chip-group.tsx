"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface MultiChipGroupProps {
  options: readonly string[];
  values: readonly string[];
  onChange: (values: readonly string[]) => void;
  ariaLabel: string;
  emptyHint?: string;
}

/** Chips de seleção múltipla — usado para limitar o acesso por subsetor. */
export function MultiChipGroup({
  options,
  values,
  onChange,
  ariaLabel,
  emptyHint = "Este setor não possui subsetores.",
}: MultiChipGroupProps) {
  if (options.length === 0) {
    return <p className="text-xs text-muted">{emptyHint}</p>;
  }

  function toggle(option: string) {
    onChange(
      values.includes(option)
        ? values.filter((value) => value !== option)
        : [...values, option],
    );
  }

  return (
    <div role="group" aria-label={ariaLabel} className="flex flex-wrap gap-2">
      {options.map((option) => {
        const selected = values.includes(option);
        return (
          <button
            key={option}
            type="button"
            role="checkbox"
            aria-checked={selected}
            onClick={() => toggle(option)}
            className={cn(
              "focus-ring flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors",
              selected
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-surface-3 text-muted hover:border-border-strong hover:text-foreground",
            )}
          >
            {selected && <Check className="h-3 w-3" />}
            {option}
          </button>
        );
      })}
    </div>
  );
}
