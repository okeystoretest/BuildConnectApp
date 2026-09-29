import assert from "node:assert/strict";
import test from "node:test";
import { aplicarCenario, compararCenario } from "./scenario";
import type { FunnelInput, ScenarioInput } from "./types";

/**
 * As três alavancas do bloco 5 do canvas. O que importa aqui é que o cenário
 * NÃO tem caminho de cálculo próprio: plano e cenário passam pelo mesmo
 * motor, e a diferença é subtração.
 */

function plano(): FunnelInput {
  return {
    goalCents: 5_000_000,
    ticketCents: 100_000,
    stages: [
      { id: "s1", label: "Oportunidades", rate: 50 },
      { id: "s2", label: "Visita", rate: 50 },
      { id: "s3", label: "Proposta", rate: 20 },
    ],
    channels: [],
  };
}

function cenario(over: Partial<ScenarioInput> = {}): ScenarioInput {
  return {
    id: "x1",
    name: "Cenário",
    ticketPercent: 0,
    topPercent: 0,
    rates: new Map(),
    ...over,
  };
}

test("etapa sem taxa própria no cenário herda a taxa do plano", () => {
  const aplicado = aplicarCenario(plano(), cenario({ rates: new Map([["s3", 25]]) }));
  assert.deepEqual(
    aplicado.stages.map((s) => s.rate),
    [50, 50, 25],
  );
});

test("ticket 10% maior reduz as conversões necessárias", () => {
  const c = compararCenario(plano(), cenario({ ticketPercent: 10 }));
  assert.equal(c.plano.requiredConversions, 50);
  // R$ 1.100 de ticket: ceil(50000/1100) = 46.
  assert.equal(c.cenario.requiredConversions, 46);
  assert.equal(c.deltaConversions, -4);
});

test("melhorar a taxa de fechamento encolhe a boca do funil", () => {
  const c = compararCenario(plano(), cenario({ rates: new Map([["s3", 25]]) }));
  assert.equal(c.plano.topVolume, 1000);
  assert.equal(c.cenario.topVolume, 800);
});

test("ticketPercent de -100 zera o ticket e vira TICKET_INVALIDO, não divisão por zero", () => {
  const c = compararCenario(plano(), cenario({ ticketPercent: -100 }));
  assert.ok(c.cenario.diagnostics.some((d) => d.code === "TICKET_INVALIDO"));
  assert.equal(c.cenario.requiredConversions, 0);
  assert.ok(Number.isFinite(c.deltaConversions));
});

test("cenário sem alavanca nenhuma é idêntico ao plano", () => {
  const c = compararCenario(plano(), cenario());
  assert.equal(c.deltaConversions, 0);
  assert.equal(c.deltaRevenueCents, 0);
});
