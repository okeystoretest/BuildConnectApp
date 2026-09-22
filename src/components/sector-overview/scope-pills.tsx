"use client";

import { cn } from "@/lib/utils";
import type { OverviewScope } from "@/lib/sector-overview-data";

/**
 * Seletor de escopo do painel: cada setor, seguido dos seus subsetores.
 *
 * Pílulas no lugar do `<select>` porque a pergunta é de comparação — "como
 * está a Logística contra a Retaguarda?" — e num dropdown as opções só
 * existem enquanto ele está aberto. Aqui a lista inteira fica à vista e trocar
 * custa um clique.
 *
 * Substitui a navegação: cada pílula é um link de verdade (`<a>`), então o
 * painel de um subsetor tem endereço próprio, abre em nova aba e volta no
 * botão do navegador. O servidor confere a combinação setor+subsetor de novo —
 * as pílulas serem só do Admin é aparência, não é a trava.
 */
export function ScopePills({
  scopes,
  sectorId,
  subsectorId,
}: {
  scopes: readonly OverviewScope[];
  sectorId: string;
  subsectorId?: string;
}) {
  if (scopes.length <= 1) return null;

  // Agrupadas por setor para a fileira ter um ritmo: o setor abre o grupo, os
  // subsetores dele vêm atrás, menores.
  const bySector = new Map<string, OverviewScope[]>();
  for (const scope of scopes) {
    const list = bySector.get(scope.sectorId) ?? [];
    list.push(scope);
    bySector.set(scope.sectorId, list);
  }

  return (
    <nav aria-label="Setor e subsetor" className="scrollbar-slim -mx-1 overflow-x-auto px-1 pb-1">
      <div className="flex w-max items-center gap-1.5">
        {[...bySector.values()].map((group, i) => (
          <div key={group[0]!.sectorId} className="flex items-center gap-1.5">
            {/* Separador entre setores: sem ele a fileira vira uma papa de
                pílulas e não se vê onde um setor termina. */}
            {i > 0 && <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-border" />}
            {group.map((scope) => {
              const active =
                scope.sectorId === sectorId && (scope.subsectorId ?? undefined) === subsectorId;
              const href = scope.subsectorId
                ? `/meu-setor?setor=${scope.sectorId}&subsetor=${scope.subsectorId}`
                : `/meu-setor?setor=${scope.sectorId}`;
              const isSector = !scope.subsectorId;

              return (
                <a
                  key={scope.subsectorId ?? scope.sectorId}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "focus-ring whitespace-nowrap rounded-full border transition-colors",
                    isSector
                      ? "px-3.5 py-1.5 text-xs font-semibold"
                      : "px-3 py-1.5 text-xs font-medium",
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : isSector
                        ? "border-border-strong bg-surface-2 text-foreground hover:border-primary/50"
                        : "border-border bg-surface text-muted hover:border-border-strong hover:text-foreground",
                  )}
                >
                  {isSector ? scope.sectorLabel : `· ${scope.subsectorLabel}`}
                </a>
              );
            })}
          </div>
        ))}
      </div>
    </nav>
  );
}
