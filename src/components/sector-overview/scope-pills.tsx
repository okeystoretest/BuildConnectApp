"use client";

import { cn } from "@/lib/utils";
import type { OverviewScope } from "@/lib/sector-overview-data";

/**
 * Seletor de setor do painel: uma pílula por setor.
 *
 * Pílulas no lugar do `<select>` porque a pergunta é de comparação — "como
 * está a Logística contra a Retaguarda?" — e num dropdown as opções só
 * existem enquanto ele está aberto. Aqui a lista inteira fica à vista e trocar
 * custa um clique.
 *
 * Substitui a navegação: cada pílula é um link de verdade (`<a>`), então o
 * painel de um setor tem endereço próprio, abre em nova aba e volta no botão
 * do navegador. O servidor confere o setor de novo — as pílulas serem só do
 * Admin é aparência, não é a trava.
 */
export function ScopePills({
  scopes,
  sectorId,
}: {
  scopes: readonly OverviewScope[];
  sectorId: string;
}) {
  if (scopes.length <= 1) return null;

  return (
    <nav aria-label="Setor" className="scrollbar-slim -mx-1 overflow-x-auto px-1 pb-1">
      <div className="flex w-max items-center gap-1.5">
        {scopes.map((scope) => {
          const active = scope.sectorId === sectorId;
          return (
            <a
              key={scope.sectorId}
              href={`/meu-setor?setor=${scope.sectorId}`}
              aria-current={active ? "page" : undefined}
              className={cn(
                "focus-ring whitespace-nowrap rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border-strong bg-surface-2 text-foreground hover:border-primary/50",
              )}
            >
              {scope.sectorLabel}
            </a>
          );
        })}
      </div>
    </nav>
  );
}
