"use client";

import Link, { useLinkStatus } from "next/link";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OverviewScope } from "@/lib/sector-overview-data";

/**
 * Conteúdo de uma pílula, com o estado de carregando do próprio link.
 *
 * `useLinkStatus` só responde dentro do `Link` a que pertence, então isto é um
 * componente e não um trecho no meio do `map`: é a única posição da árvore de
 * onde dá para saber que ESTA pílula, e não outra, está navegando.
 *
 * O spinner ocupa lugar ao lado do rótulo em vez de substituí-lo. Trocar o
 * texto pelo spinner mudaria a largura da pílula no meio do clique e empurraria
 * as vizinhas — o movimento que a pessoa lê como "a página piscou".
 */
function PillContent({ label }: { label: string }) {
  const { pending } = useLinkStatus();

  return (
    <span
      aria-busy={pending || undefined}
      className={cn("flex items-center gap-1.5 transition-opacity", pending && "opacity-70")}
    >
      {pending && <Loader2 className="h-3 w-3 shrink-0 animate-spin" aria-hidden="true" />}
      {label}
    </span>
  );
}

/**
 * Seletor de setor do painel: uma pílula por setor.
 *
 * Pílulas no lugar do `<select>` porque a pergunta é de comparação — "como
 * está a Logística contra a Retaguarda?" — e num dropdown as opções só
 * existem enquanto ele está aberto. Aqui a lista inteira fica à vista e trocar
 * custa um clique.
 *
 * Substitui a navegação: cada pílula é um link de verdade, então o painel de
 * um setor tem endereço próprio, abre em nova aba e volta no botão do
 * navegador. O servidor confere o setor de novo — as pílulas serem só do Admin
 * é aparência, não é a trava.
 *
 * `Link` e não `<a>`: a âncora nativa fazia o navegador recarregar o documento
 * inteiro a cada troca de setor. Além do branco entre as duas telas, a recarga
 * remontava o `SectorOverviewView` do zero e levava junto a aba aberta e o
 * texto digitado na busca — trocar de setor devolvia a pessoa a "Colaboradores"
 * com o campo limpo. Com `Link`, só o conteúdo do servidor é refeito; o estado
 * do cliente sobrevive porque o componente nunca é desmontado.
 *
 * `scroll={false}` pelo mesmo motivo: a rolagem ao topo a cada clique é um
 * salto visual, e as pílulas ficam no meio da página.
 */
/** Estilo compartilhado pelas duas fileiras; só o tom muda com o estado. */
function pillClass(active: boolean, strong: boolean): string {
  return cn(
    "focus-ring whitespace-nowrap rounded-full border text-xs font-semibold transition-colors",
    strong ? "px-3.5 py-1.5" : "px-3 py-1",
    active
      ? strong
        ? "border-primary bg-primary text-primary-foreground"
        : "border-primary bg-primary/10 text-primary"
      : "border-border-strong bg-surface-2 text-foreground hover:border-primary/50",
  );
}

export function ScopePills({
  scopes,
  sectorId,
  subsectorId,
}: {
  scopes: readonly OverviewScope[];
  sectorId: string;
  /** Subsetor aberto, ou nulo para o setor inteiro. */
  subsectorId: string | null;
}) {
  const aberto = scopes.find((s) => s.sectorId === sectorId);
  const subsectors = aberto?.subsectors ?? [];

  // Nada a escolher: um setor só e sem subsetores.
  if (scopes.length <= 1 && subsectors.length === 0) return null;

  return (
    <div className="space-y-2">
      {/* A fileira de setores só aparece para quem alcança mais de um — o
          Gestor é preso ao próprio no servidor, e para ele sobra a de baixo. */}
      {scopes.length > 1 && (
        <nav aria-label="Setor" className="scrollbar-slim -mx-1 overflow-x-auto px-1 pb-1">
          <div className="flex w-max items-center gap-1.5">
            {scopes.map((scope) => (
              <Link
                key={scope.sectorId}
                // Trocar de setor LIMPA o subsetor: o id não existe no setor
                // novo, e carregá-lo faria a tela ignorá-lo em silêncio.
                href={`/meu-setor?setor=${scope.sectorId}`}
                scroll={false}
                aria-current={scope.sectorId === sectorId ? "page" : undefined}
                className={pillClass(scope.sectorId === sectorId, true)}
              >
                <PillContent label={scope.sectorLabel} />
              </Link>
            ))}
          </div>
        </nav>
      )}

      {/* Os subsetores DO SETOR ABERTO. Aparecem como consequência de escolher
          o setor acima — é a hierarquia pedida — e "Todos" é o estado de
          partida, não uma opção a mais: sem ele não haveria como voltar ao
          setor inteiro depois de filtrar. */}
      {subsectors.length > 0 && (
        <nav
          aria-label={`Subsetor de ${aberto?.sectorLabel ?? ""}`}
          className="scrollbar-slim -mx-1 overflow-x-auto px-1 pb-1"
        >
          <div className="flex w-max items-center gap-1.5">
            <Link
              href={`/meu-setor?setor=${sectorId}`}
              scroll={false}
              aria-current={subsectorId === null ? "page" : undefined}
              className={pillClass(subsectorId === null, false)}
            >
              <PillContent label="Todos" />
            </Link>
            {subsectors.map((sub) => (
              <Link
                key={sub.subsectorId}
                href={`/meu-setor?setor=${sectorId}&subsetor=${sub.subsectorId}`}
                scroll={false}
                aria-current={sub.subsectorId === subsectorId ? "page" : undefined}
                className={pillClass(sub.subsectorId === subsectorId, false)}
              >
                <PillContent label={sub.subsectorLabel} />
              </Link>
            ))}
          </div>
        </nav>
      )}
    </div>
  );
}
