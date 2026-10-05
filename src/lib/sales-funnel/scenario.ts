import { calcularAscendente, calcularDescendente, resultadoVazio } from "./math";
import { topoPorAtividade } from "./plano-de-acao";
import type { Equipe, FunnelInput, ScenarioComparison, ScenarioInput } from "./types";

/**
 * Projeta o plano sob as alavancas do cenário.
 *
 * O ticket é arredondado para o centavo inteiro mais próximo: continuamos em
 * centavos inteiros depois do ajuste percentual, que é a única operação do
 * motor capaz de produzir fração de centavo.
 *
 * A alavanca da boca do funil NÃO entra aqui: ela não muda a entrada, muda o
 * topo de onde o cenário desce, e é aplicada em `compararCenario`.
 */
export function aplicarCenario(plano: FunnelInput, cenario: ScenarioInput): FunnelInput {
  return {
    ...plano,
    ticketCents: Math.round(plano.ticketCents * (1 + cenario.ticketPercent / 100)),
    stages: plano.stages.map((stage) => ({
      ...stage,
      rate: cenario.rates.get(stage.id) ?? stage.rate,
    })),
  };
}

/**
 * Plano e cenário, e o que se ganha entre um e outro.
 *
 * O PLANO SOBE e o CENÁRIO DESCE, e essa assimetria é a metodologia, não um
 * acidente: o plano responde "quanta atividade a meta exige" (445 prospecções),
 * e o cenário responde "quanto essa mesma atividade rende se a alavanca
 * melhorar". Até 30/09/2026 os dois lados subiam, com a meta travada — e no
 * sentido ascendente melhorar uma taxa não aumenta faturamento nenhum, só
 * reduz o esforço. Medido na auditoria: melhorar a taxa de entrada de 33% para
 * 40% dava ganho de R$ 0,00, e ticket 10% maior aparecia como PERDA de
 * R$ 1.712,36, porque o plano precisava de menos conversões. As três alavancas
 * do bloco 5 mediam o inverso do que o canvas pede.
 *
 * O topo do cenário, em ordem: a alavanca de atividade diária, se preenchida;
 * senão, o topo do plano. Herdar o topo é o que faz um cenário sem alavanca
 * nenhuma ser idêntico ao plano — o ida e volta do motor é exato, varrido em
 * `math.test.ts`.
 *
 * `equipe` só é necessária para a alavanca de atividade diária. Sem ela, as
 * outras duas alavancas funcionam igual.
 */
export function compararCenario(
  plano: FunnelInput,
  cenario: ScenarioInput,
  equipe: Equipe | null = null,
): ScenarioComparison {
  const base = calcularAscendente(plano);

  // Plano que não fecha não tem topo de onde descer. O cenário repete os
  // diagnósticos do plano, porque "Informe a meta global." é o que a pessoa
  // precisa ler — e não uma reclamação sobre volume de prospecções.
  if (base.diagnostics.some((d) => d.severity === "erro")) {
    return {
      plano: base,
      cenario: resultadoVazio([...base.diagnostics]),
      deltaConversions: 0,
      ganhoCents: null,
    };
  }

  const entrada = aplicarCenario(plano, cenario);
  const projetado = projetar(entrada, cenario, equipe, base.topVolume);
  const falhou = projetado.diagnostics.some((d) => d.severity === "erro");

  return {
    plano: base,
    cenario: projetado,
    deltaConversions: projetado.requiredConversions - base.requiredConversions,
    // Contra a META, não contra o faturamento do plano: o faturamento do plano
    // é ele mesmo artefato do arredondamento das conversões.
    ganhoCents: falhou ? null : projetado.projectedRevenueCents - plano.goalCents,
  };
}

/** De que topo o cenário desce, e o que sai disso. */
function projetar(
  entrada: FunnelInput,
  cenario: ScenarioInput,
  equipe: Equipe | null,
  topoDoPlano: number,
) {
  if (cenario.opportunitiesPerSellerDay === undefined) {
    return calcularDescendente(entrada, topoDoPlano);
  }

  const topo = topoPorAtividade(cenario.opportunitiesPerSellerDay, equipe);
  if (topo === null) {
    return resultadoVazio([
      {
        code: "EQUIPE_AUSENTE",
        severity: "erro",
        message:
          "Informe quantos vendedores e quantos dias úteis o período tem para simular a boca do funil.",
      },
    ]);
  }
  return calcularDescendente(entrada, topo);
}
