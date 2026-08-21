"use client";

import { cn } from "@/lib/utils";

export interface TabItem {
  id: string;
  label: string;
}

export interface TabsProps {
  items: readonly TabItem[];
  value: string;
  onValueChange: (id: string) => void;
  className?: string;
}

/** Tabs em pill, replicando o padrão de abas dos setores no design. */
export function Tabs({ items, value, onValueChange, className }: TabsProps) {
  return (
    <div
      role="tablist"
      className={cn(
        // w-fit impede que a barra estique além dos botões; max-w-full
        // mantém o scroll horizontal quando as abas não cabem.
        "scrollbar-slim flex w-fit max-w-full items-center gap-1 overflow-x-auto rounded-lg border border-border bg-surface p-1",
        className,
      )}
    >
      {items.map((item) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onValueChange(item.id)}
            className={cn(
              "focus-ring whitespace-nowrap rounded-md px-3.5 py-2 text-sm transition-colors",
              active
                ? "bg-primary font-semibold text-primary-foreground"
                : "text-muted hover:bg-surface-2 hover:text-foreground",
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
