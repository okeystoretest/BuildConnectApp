import { calcularAscendente } from "./math";
import type { FunnelInput, ScenarioComparison, ScenarioInput } from "./types";

/**
 * Projeta o plano sob as alavancas do cenário.
 *
 * O ticket é arredondado para o centavo inteiro mais próximo: continuamos em
 * centavos inteiros depois do ajuste percentual, que é a única operação do
 * motor capaz de produzir fração de centavo.
 *
 * `topPercent` NÃO entra aqui: ele só faz sentido no sentido descendente, em
 * que o topo é informado, e é aplicado por quem chama `calcularDescendente`.
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
 * Plano e cenário pelo MESMO motor, e a diferença entre eles. Um cenário
 * nunca tem caminho de cálculo próprio — se tivesse, os dois números da tela
 * poderiam divergir por motivo que não é a alavanca.
 */
export function compararCenario(
  plano: FunnelInput,
  cenario: ScenarioInput,
): ScenarioComparison {
  const base = calcularAscendente(plano);
  const projetado = calcularAscendente(aplicarCenario(plano, cenario));
  return {
    plano: base,
    cenario: projetado,
    deltaConversions: projetado.requiredConversions - base.requiredConversions,
    deltaRevenueCents: projetado.projectedRevenueCents - base.projectedRevenueCents,
  };
}
