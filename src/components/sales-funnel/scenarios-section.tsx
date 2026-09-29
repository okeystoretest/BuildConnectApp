"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { excluirCenario } from "@/lib/sales-funnel/actions";
import { compararCenario } from "@/lib/sales-funnel/scenario";
import { formatarReais, formatarVolume } from "@/lib/sales-funnel/format";
import type { FunnelInput, ScenarioInput } from "@/lib/sales-funnel/types";
import type { FunnelScenarioItem } from "@/types/sales-funnel";
import { cn } from "@/lib/utils";
import { ScenarioModal } from "./scenario-modal";

/**
 * Bloco 5 do canvas: as simulações.
 *
 * Plano e cenários lado a lado, cada um pelo MESMO motor. A diferença é
 * subtração — nenhum cenário tem caminho de cálculo próprio, senão os dois
 * números da tela poderiam divergir por motivo que não é a alavanca.
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
  canManage,
}: {
  slug: string;
  funnelId: string;
  plano: FunnelInput;
  etapasSalvas: readonly { id: string; label: string; rate: number }[];
  cenarios: readonly FunnelScenarioItem[];
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
          topPercent: c.topPercent,
          rates: new Map(Object.entries(c.rates)),
        };
        return { cenario: c, resultado: compararCenario(planoSalvo, entrada) };
      }),
    [cenarios, planoSalvo],
  );

  const base = comparacoes[0]?.resultado.plano;

  async function remover(id: string) {
    setRemovendo(id);
    await excluirCenario(slug, id);
    setRemovendo(null);
    router.refresh();
  }

  return (
    <section className="space-y-3 rounded-lg border border-border bg-surface-1 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold">5 · Simulações</h3>
          <p className="text-sm text-muted">
            Aumente a boca do funil, melhore as taxas internas ou o ticket médio — e veja no que dá.
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setEditando(null);
            setAberto(true);
          }}
        >
          {canManage ? "Novo cenário" : "Simular"}
        </Button>
      </div>

      {cenarios.length === 0 ? (
        <p className="text-sm text-muted">Nenhum cenário salvo ainda.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {/* Coluna do plano, sempre primeira: é a régua das outras. */}
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
            <h4 className="font-semibold">Plano</h4>
            <dl className="mt-2 space-y-1 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-muted">Conversões</dt>
                <dd className="font-semibold tabular-nums">
                  {formatarVolume(base?.requiredConversions ?? 0)}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted">Prospecções</dt>
                <dd className="font-semibold tabular-nums">
                  {formatarVolume(base?.topVolume ?? 0)}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted">Faturamento</dt>
                <dd className="font-semibold tabular-nums">
                  {formatarReais(base?.projectedRevenueCents ?? 0)}
                </dd>
              </div>
            </dl>
          </div>

          {comparacoes.map(({ cenario, resultado }) => {
            const erro = resultado.cenario.diagnostics.find((d) => d.severity === "erro");
            return (
              <div key={cenario.id} className="rounded-lg border border-border bg-surface-2 p-3">
                <div className="flex items-start justify-between gap-2">
                  <h4 className="min-w-0 truncate font-semibold">{cenario.name}</h4>
                  {canManage && (
                    <div className="flex shrink-0 gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Editar ${cenario.name}`}
                        onClick={() => {
                          setEditando(cenario);
                          setAberto(true);
                        }}
                      >
                        ✎
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Excluir ${cenario.name}`}
                        disabled={removendo === cenario.id}
                        onClick={() => remover(cenario.id)}
                      >
                        ✕
                      </Button>
                    </div>
                  )}
                </div>

                {erro ? (
                  <p className="mt-2 text-sm text-danger">{erro.message}</p>
                ) : (
                  <dl className="mt-2 space-y-1 text-sm">
                    <Linha
                      rotulo="Conversões"
                      valor={formatarVolume(resultado.cenario.requiredConversions)}
                      delta={resultado.deltaConversions}
                      // Menos conversões para a mesma meta é melhor.
                      menorEMelhor
                    />
                    <Linha
                      rotulo="Prospecções"
                      valor={formatarVolume(resultado.cenario.topVolume)}
                      delta={resultado.cenario.topVolume - (base?.topVolume ?? 0)}
                      menorEMelhor
                    />
                    <Linha
                      rotulo="Faturamento"
                      valor={formatarReais(resultado.cenario.projectedRevenueCents)}
                      delta={resultado.deltaRevenueCents}
                      moeda
                    />
                  </dl>
                )}

                {cenario.notes && <p className="mt-2 text-xs text-muted">{cenario.notes}</p>}
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
        onClose={() => setAberto(false)}
      />
    </section>
  );
}

/** Uma linha do comparativo, com o delta em relação ao plano. */
function Linha({
  rotulo,
  valor,
  delta,
  moeda,
  menorEMelhor,
}: {
  rotulo: string;
  valor: string;
  delta: number;
  moeda?: boolean;
  menorEMelhor?: boolean;
}) {
  const bom = menorEMelhor ? delta < 0 : delta > 0;
  const texto = moeda ? formatarReais(Math.abs(delta)) : formatarVolume(Math.abs(delta));

  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-muted">{rotulo}</dt>
      <dd className="flex items-baseline gap-2">
        <span className="font-semibold tabular-nums">{valor}</span>
        {delta !== 0 && (
          <span className={cn("text-xs tabular-nums", bom ? "text-primary" : "text-warning")}>
            {delta > 0 ? "+" : "−"}
            {texto}
          </span>
        )}
      </dd>
    </div>
  );
}
