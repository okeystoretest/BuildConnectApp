"use client";

import { cn } from "@/lib/utils";

export interface ChipGroupProps {
  options: readonly string[];
  value: string | null;
  onChange: (value: string) => void;
  ariaLabel: string;
}

/** Categorias em chips que quebram linha, como no modelo de TI. */
export function ChipGroup({ options, value, onChange, ariaLabel }: ChipGroupProps) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="flex flex-wrap gap-2">
      {options.map((option) => {
        const selected = option === value;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option)}
            className={cn(
              "focus-ring rounded-lg border px-3 py-2 text-xs font-medium transition-colors",
              selected
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-surface-2 text-muted hover:border-border-strong hover:text-foreground",
            )}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}
