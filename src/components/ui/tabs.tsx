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
              "focus-ring whitespace-nowrap rounded-md px-3.5 py-2 text-sm transition-all duration-200 ease-smooth",
              active
                ? "scale-[1.02] bg-primary font-semibold text-primary-foreground shadow-sm"
                : "scale-100 text-muted hover:bg-surface-2 hover:text-foreground",
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Painel de aba com transição de entrada.
 *
 * A `key` no id da aba força a remontagem do wrapper a cada troca, o que
 * reexecuta a animação. Usar aqui, e não em cada painel, mantém o efeito
 * idêntico em todos os setores (padrão, Retaguarda, Motoristas e DHO).
 */
export function TabPanel({
  tabId,
  className,
  children,
}: {
  tabId: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div key={tabId} role="tabpanel" className={cn("animate-tab-in", className)}>
      {children}
    </div>
  );
}
