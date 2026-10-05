"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { excluirCenario } from "@/lib/sales-funnel/actions";
import { compararCenario } from "@/lib/sales-funnel/scenario";
import { formatarReais, formatarVolume } from "@/lib/sales-funnel/format";
import type { Equipe, FunnelInput, ScenarioInput } from "@/lib/sales-funnel/types";
import type { FunnelScenarioItem } from "@/types/sales-funnel";
import { cn } from "@/lib/utils";
import { ScenarioModal } from "./scenario-modal";
import { CanvasBlock } from "./canvas-block";

/**
 * Bloco 5 do canvas: as simulações.
 *
 * Plano e cenários lado a lado, cada um pelo MESMO motor — nenhum cenário tem
 * caminho de cálculo próprio, senão os dois números da tela poderiam divergir
 * por motivo que não é a alavanca.
 *
 * O plano SOBE da meta até a atividade; cada cenário DESCE daquela mesma
 * atividade até o faturamento. É por isso que a segunda coluna é o ganho em
 * reais, e não o tamanho da boca do funil: o cenário responde "quanto isto
 * rende se a alavanca melhorar", e não "de quanto esforço eu escapo".
 *
 * Um cenário guarda a taxa apontando para o ID da etapa. Quando as etapas são
 * regravadas, os ids mudam e as taxas somem pela cascata do banco — por isso
 * o editor avisa antes de salvar uma mudança de etapas.
 */
export function ScenariosSection({
  slug,
  funnelId,
  plano,
  /** Etapas do funil SALVO — o cenário aponta para estes ids, não para as
   *  linhas que estão sendo editadas na tela. */
  etapasSalvas,
  cenarios,
  equipe,
  canManage,
}: {
  slug: string;
  funnelId: string;
  plano: FunnelInput;
  etapasSalvas: readonly { id: string; label: string; rate: number }[];
  cenarios: readonly FunnelScenarioItem[];
  /** Só a alavanca de atividade diária depende dela. */
  equipe: Equipe | null;
  canManage: boolean;
}) {
  const router = useRouter();
  const [editando, setEditando] = useState<FunnelScenarioItem | null>(null);
  const [aberto, setAberto] = useState(false);
  const [removendo, setRemovendo] = useState<string | null>(null);

  // O plano do comparativo usa as etapas SALVAS: comparar contra o que está
  // sendo digitado faria o delta mudar a cada tecla, sem o cenário ter mudado.
  const planoSalvo: FunnelInput = useMemo(
    () => ({ ...plano, stages: etapasSalvas }),
    [plano, etapasSalvas],
  );

  const comparacoes = useMemo(
    () =>
      cenarios.map((c) => {
        const entrada: ScenarioInput = {
          id: c.id,
          name: c.name,
          ticketPercent: c.ticketPercent,
          opportunitiesPerSellerDay: c.opportunitiesPerSellerDay,
          rates: new Map(Object.entries(c.rates)),
        };
        return { cenario: c, resultado: compararCenario(planoSalvo, entrada, equipe) };
      }),
    [cenarios, planoSalvo, equipe],
  );

  const base = comparacoes[0]?.resultado.plano;

  async function remover(id: string) {
    setRemovendo(id);
    await excluirCenario(slug, id);
    setRemovendo(null);
    router.refresh();
  }

  return (
    <CanvasBlock
      numero={4}
      titulo="Simulações"
      acao={
        <button
          type="button"
          onClick={() => {
            setEditando(null);
            setAberto(true);
          }}
          className="rounded px-1.5 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/10"
        >
          {canManage ? "+ cenário" : "simular"}
        </button>
      }
    >
      {cenarios.length === 0 ? (
        <p className="text-xs text-muted">
          Nenhum cenário. Mexa no ticket, nas taxas ou na boca do funil e veja quanto a
          mesma atividade passa a faturar.
        </p>
      ) : (
        <div className="space-y-1">
          {/* O plano é a régua: primeira linha, sempre. */}
          <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-2 py-1.5">
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">Plano</span>
            <span className="w-12 text-right text-sm font-semibold tabular-nums">
              {formatarVolume(base?.requiredConversions ?? 0)}
            </span>
            <span className="w-14 text-right text-sm tabular-nums text-muted">
              {formatarVolume(base?.topVolume ?? 0)}
            </span>
            {/* O plano é o zero da régua: o ganho dele é a própria meta. */}
            <span className="w-24 text-right text-sm tabular-nums text-muted">—</span>
            <span className="w-5" />
          </div>

          <div className="flex items-center gap-2 px-2 text-[10px] uppercase tracking-wider text-muted">
            <span className="min-w-0 flex-1" />
            <span className="w-12 text-right">Negóc.</span>
            <span className="w-14 text-right">Prosp.</span>
            <span className="w-24 text-right">Ganho</span>
            <span className="w-5" />
          </div>

          {comparacoes.map(({ cenario, resultado }) => {
            const erro = resultado.cenario.diagnostics.find((d) => d.severity === "erro");
            return (
              <div
                key={cenario.id}
                className="rounded-md border border-border bg-surface-2 px-2 py-1.5"
              >
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditando(cenario);
                      setAberto(true);
                    }}
                    className="min-w-0 flex-1 truncate text-left text-sm hover:text-primary"
                  >
                    {cenario.name}
                  </button>

                  {erro ? (
                    <span className="flex-1 truncate text-right text-xs text-danger">
                      {erro.message}
                    </span>
                  ) : (
                    <>
                      <Valor
                        valor={formatarVolume(resultado.cenario.requiredConversions)}
                        delta={resultado.deltaConversions}
                        className="w-12"
                      />
                      <Valor
                        valor={formatarVolume(resultado.cenario.topVolume)}
                        delta={resultado.cenario.topVolume - (base?.topVolume ?? 0)}
                        className="w-14"
                      />
                      <Ganho cents={resultado.ganhoCents} />
                    </>
                  )}

                  {canManage && (
                    <button
                      type="button"
                      aria-label={`Excluir ${cenario.name}`}
                      disabled={removendo === cenario.id}
                      onClick={() => remover(cenario.id)}
                      className="flex h-6 w-5 shrink-0 items-center justify-center rounded text-xs text-muted hover:bg-danger/15 hover:text-danger disabled:opacity-40"
                    >
                      ✕
                    </button>
                  )}
                </div>
                {cenario.notes && (
                  <p className="mt-0.5 truncate text-[11px] text-muted">{cenario.notes}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      <ScenarioModal
        slug={slug}
        funnelId={funnelId}
        open={aberto}
        cenario={editando}
        etapas={etapasSalvas}
        canManage={canManage}
        plano={planoSalvo}
        equipe={equipe}
        onClose={() => setAberto(false)}
      />
    </CanvasBlock>
  );
}

/**
 * Um número do comparativo com seu delta.
 *
 * Menos conversões e menos prospecções para a mesma meta é MELHOR — por isso
 * o verde é o negativo aqui, ao contrário do que a intuição diria.
 */
function Valor({
  valor,
  delta,
  className,
}: {
  valor: string;
  delta: number;
  className?: string;
}) {
  return (
    <span className={cn("shrink-0 text-right", className)}>
      <span className="block text-sm font-semibold tabular-nums">{valor}</span>
      {delta !== 0 && (
        <span className="block text-[10px] tabular-nums text-muted">
          {delta > 0 ? "+" : "−"}
          {formatarVolume(Math.abs(delta))}
        </span>
      )}
    </span>
  );
}

/**
 * O ganho do cenário sobre a META, em reais.
 *
 * É a única coluna que se pinta, porque é a única cuja direção é inequívoca:
 * mais faturamento é melhor. Verde é `primary` e não `success` — o tema do
 * projeto não define `success`, e `text-success` não gera classe nenhuma.
 */
function Ganho({ cents }: { cents: number | null }) {
  if (cents === null) {
    return <span className="w-24 shrink-0 text-right text-sm tabular-nums text-muted">—</span>;
  }
  return (
    <span
      className={cn(
        "w-24 shrink-0 text-right text-sm font-semibold tabular-nums",
        cents >= 0 ? "text-primary" : "text-danger",
      )}
    >
      {cents >= 0 ? "+" : "−"}
      {formatarReais(Math.abs(cents))}
    </span>
  );
}
