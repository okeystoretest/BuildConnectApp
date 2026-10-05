import assert from "node:assert/strict";
import test from "node:test";
import { aplicarCenario, compararCenario } from "./scenario";
import type { FunnelInput, ScenarioInput } from "./types";

/**
 * As três alavancas do bloco 5 do canvas.
 *
 * O que estes testes protegem é a DIREÇÃO: o plano sobe da meta até a
 * atividade, o cenário desce daquela atividade até o faturamento. Antes de
 * 30/09/2026 os dois lados subiam, e no sentido ascendente melhorar uma
 * alavanca não aumenta faturamento — só reduz esforço. Por isso "melhorar a
 * taxa de entrada" dava ganho de R$ 0,00 e "ticket 10% maior" aparecia como
 * perda.
 */
function plano(): FunnelInput {
  return {
    goalCents: 5_000_000, // R$ 50.000,00
    ticketCents: 100_000, // R$ 1.000,00
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
    rates: new Map(),
    ...over,
  };
}

const EQUIPE = { vendedores: 4, diasUteis: 22 };

test("etapa sem taxa própria no cenário herda a taxa do plano", () => {
  const aplicado = aplicarCenario(plano(), cenario({ rates: new Map([["s3", 25]]) }));
  assert.deepEqual(
    aplicado.stages.map((s) => s.rate),
    [50, 50, 25],
  );
});

test("cenário sem alavanca nenhuma é idêntico ao plano", () => {
  const c = compararCenario(plano(), cenario());
  assert.equal(c.cenario.requiredConversions, c.plano.requiredConversions);
  assert.equal(c.cenario.topVolume, c.plano.topVolume);
  assert.equal(c.deltaConversions, 0);
  assert.equal(c.ganhoCents, 0);
});

test("melhorar a taxa de fechamento aumenta o FATURAMENTO, não encolhe o funil", () => {
  // A mesma atividade do plano — 1.000 prospecções — com a última etapa
  // convertendo a 25% em vez de 20%: 1.000 -> 500 -> 250 -> 62,5 -> 63.
  const c = compararCenario(plano(), cenario({ rates: new Map([["s3", 25]]) }));
  assert.equal(c.plano.topVolume, 1000);
  assert.equal(c.cenario.topVolume, 1000, "a boca do funil NÃO encolhe");
  assert.equal(c.cenario.requiredConversions, 63);
  assert.equal(c.deltaConversions, 13);
  assert.equal(c.ganhoCents, 1_300_000); // R$ 13.000,00 acima da meta
});

test("ticket 10% maior projeta mais faturamento com a mesma atividade", () => {
  const c = compararCenario(plano(), cenario({ ticketPercent: 10 }));
  // As conversões não mudam: a atividade é a mesma e as taxas são as mesmas.
  assert.equal(c.cenario.requiredConversions, 50);
  assert.equal(c.deltaConversions, 0);
  // 50 negócios a R$ 1.100 são R$ 55.000 contra uma meta de R$ 50.000.
  assert.equal(c.cenario.projectedRevenueCents, 5_500_000);
  assert.equal(c.ganhoCents, 500_000);
});

test("a alavanca de atividade diária muda a boca do funil", () => {
  // 15 oportunidades por vendedor por dia, 4 vendedores, 22 dias = 1.320.
  const c = compararCenario(plano(), cenario({ opportunitiesPerSellerDay: 15 }), EQUIPE);
  assert.equal(c.cenario.topVolume, 1320);
  assert.equal(c.cenario.requiredConversions, 66); // 1320 -> 660 -> 330 -> 66
  assert.equal(c.ganhoCents, 1_600_000); // R$ 66.000 contra R$ 50.000 de meta
});

test("a alavanca de atividade diária sem equipe declarada é EQUIPE_AUSENTE", () => {
  const c = compararCenario(plano(), cenario({ opportunitiesPerSellerDay: 15 }), null);
  const erro = c.cenario.diagnostics.find((d) => d.code === "EQUIPE_AUSENTE");
  assert.equal(erro?.severity, "erro");
  assert.equal(c.ganhoCents, null, "sem cálculo não há ganho a exibir");
});

test("ticketPercent de -100 zera o ticket e vira TICKET_INVALIDO, não divisão por zero", () => {
  const c = compararCenario(plano(), cenario({ ticketPercent: -100 }));
  assert.ok(c.cenario.diagnostics.some((d) => d.code === "TICKET_INVALIDO"));
  assert.equal(c.cenario.requiredConversions, 0);
  assert.equal(c.ganhoCents, null);
  assert.ok(Number.isFinite(c.deltaConversions));
});

test("plano que não fecha faz o cenário repetir a frase do plano", () => {
  // Sem topo não há de onde descer, e a pessoa precisa ler o que falta no
  // PLANO — não uma reclamação sobre volume de prospecções.
  const c = compararCenario({ ...plano(), goalCents: 0 }, cenario({ ticketPercent: 10 }));
  assert.ok(c.cenario.diagnostics.some((d) => d.code === "META_INVALIDA"));
  assert.ok(!c.cenario.diagnostics.some((d) => d.code === "VOLUME_IRREAL"));
  assert.equal(c.ganhoCents, null);
  assert.equal(c.deltaConversions, 0);
});

/*
 * As duas simulações do caso de teste da auditoria de 30/09/2026, com os
 * valores da metodologia de referência.
 */

/** Meta R$ 75.000, ticket R$ 2.140,65, etapas 33% / 60% / 40%. */
function planoDaAuditoria(): FunnelInput {
  return {
    goalCents: 7_500_000,
    ticketCents: 214_065,
    stages: [
      { id: "s1", label: "Oportunidade", rate: 33 },
      { id: "s2", label: "Visita", rate: 60 },
      { id: "s3", label: "Proposta", rate: 40 },
    ],
    channels: [],
  };
}

test("auditoria S2: taxa de entrada a 40% dá 178 visitas, 107 propostas e 43 negócios", () => {
  const c = compararCenario(planoDaAuditoria(), cenario({ rates: new Map([["s1", 40]]) }));
  assert.equal(c.plano.requiredConversions, 35);
  assert.equal(c.plano.topVolume, 445);
  assert.deepEqual(
    c.cenario.stages.map((s) => s.volume),
    [445, 178, 107], // 445 × 0,40 = 178 · 178 × 0,60 = 106,8 -> 107
  );
  assert.equal(c.cenario.requiredConversions, 43); // 107 × 0,40 = 42,8 -> 43
  assert.equal(c.cenario.projectedRevenueCents, 9_204_795); // R$ 92.047,95
  assert.equal(c.ganhoCents, 1_704_795); // R$ 17.047,95
  assert.equal(c.deltaConversions, 8);
});

test("auditoria S1: 6 oportunidades por vendedor por dia dão 528 no topo e 42 negócios", () => {
  const c = compararCenario(
    planoDaAuditoria(),
    cenario({ opportunitiesPerSellerDay: 6 }),
    EQUIPE,
  );
  assert.equal(c.cenario.topVolume, 528); // 6 × 22 × 4
  assert.equal(c.cenario.requiredConversions, 42);
  assert.equal(c.cenario.projectedRevenueCents, 8_990_730); // R$ 89.907,30
  assert.equal(c.ganhoCents, 1_490_730); // R$ 14.907,30
});
