"use client";

import { Check, ChevronDown, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import { ROLE_LABEL, ROLE_ORDER } from "@/lib/permissions";
import { useRole } from "@/providers/role-provider";
import { Dropdown } from "@/components/ui/dropdown";

/**
 * Alterna o papel ativo. Nesta fase serve como demonstração de acesso;
 * na integração real o papel vem da sessão e este controle sai da topbar.
 */
export function RoleSwitcher() {
  const { role, setRole } = useRole();

  return (
    <Dropdown
      trigger={({ open }) => (
        <span
          className={cn(
            "flex h-9 items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 text-sm text-foreground transition-colors hover:border-border-strong",
            open && "border-border-strong",
          )}
        >
          <Circle className="h-3 w-3 text-muted" />
          {ROLE_LABEL[role]}
          <ChevronDown className={cn("h-4 w-4 text-muted transition-transform", open && "rotate-180")} />
        </span>
      )}
    >
      {({ close }) =>
        ROLE_ORDER.map((option) => (
          <button
            key={option}
            role="menuitem"
            type="button"
            onClick={() => {
              setRole(option);
              close();
            }}
            className="focus-ring flex w-full items-center justify-between rounded-md px-3 py-2 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            {ROLE_LABEL[option]}
            {role === option && <Check className="h-4 w-4 text-primary" />}
          </button>
        ))
      }
    </Dropdown>
  );
}
