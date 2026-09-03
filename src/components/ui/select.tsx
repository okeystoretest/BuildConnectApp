"use client";

import { forwardRef } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Opção do select. A forma curta (string) serve às listas em que o rótulo É o
 * valor gravado — tipo de serviço, unidade. A forma longa separa os dois, para
 * listas cujo valor é um id e o rótulo, um nome de pessoa.
 */
export type SelectOption = string | { value: string; label: string };

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  options: readonly SelectOption[];
  /** Quando presente, adiciona uma opção vazia inicial. */
  placeholder?: string;
}

function optionValue(option: SelectOption): string {
  return typeof option === "string" ? option : option.value;
}

function optionLabel(option: SelectOption): string {
  return typeof option === "string" ? option : option.label;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, options, placeholder, value, ...props }, ref) => {
    const empty = placeholder !== undefined && (value === "" || value === undefined);

    return (
      <div className="relative">
        <select
          ref={ref}
          value={value}
          className={cn(
            "focus-ring h-11 w-full appearance-none rounded-xl border border-border bg-surface-2 pl-3 pr-9 text-sm transition-colors hover:border-border-strong",
            empty ? "text-muted" : "text-foreground",
            className,
          )}
          {...props}
        >
          {placeholder !== undefined && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((option) => (
            <option key={optionValue(option)} value={optionValue(option)}>
              {optionLabel(option)}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
      </div>
    );
  },
);

Select.displayName = "Select";
