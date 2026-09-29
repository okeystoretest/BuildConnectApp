import assert from "node:assert/strict";
import test from "node:test";
import {
  LIMITE_VOLUME,
  calcularAscendente,
  conversoesNecessarias,
  parseMoedaParaCentavos,
} from "./math";
import type { FunnelInput } from "./types";

/**
 * O motor do Funil de Vendas. Estes testes são a régua do canvas impresso:
 * o exemplo da folha (R$ 50.000 / ticket R$ 1.000 / 20-50-50) tem de dar
 * exatamente 1.000 oportunidades no topo.
 */

/** Plano do exemplo impresso, para os testes não repetirem a montagem. */
function planoDoCanvas(): FunnelInput {
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

test("o exemplo do canvas impresso fecha em 50 conversões e 1.000 oportunidades", () => {
  const r = calcularAscendente(planoDoCanvas());
  assert.equal(r.requiredConversions, 50);
  assert.deepEqual(
    r.stages.map((s) => s.volume),
    [1000, 500, 250],
  );
  assert.equal(r.topVolume, 1000);
  assert.equal(r.externalRate, 5);
  assert.equal(r.projectedRevenueCents, 5_000_000);
  assert.deepEqual(r.diagnostics, []);
});

test("ascendente arredonda para CIMA: 205,5 propostas viram 206", () => {
  // 37 conversões a 18% = 205,55 -> 206.
  const r = calcularAscendente({
    ...planoDoCanvas(),
    goalCents: 3_700_000,
    stages: [{ id: "s1", label: "Proposta", rate: 18 }],
  });
  assert.equal(r.requiredConversions, 37);
  assert.equal(r.stages[0]?.volume, 206);
});

test("ticket MAIOR que a meta ainda exige uma conversão, nunca zero", () => {
  assert.equal(conversoesNecessarias(50_000, 100_000), 1);
});

test("meta zerada e ticket zerado viram erro, sem volume calculado", () => {
  const semTicket = calcularAscendente({ ...planoDoCanvas(), ticketCents: 0 });
  assert.equal(semTicket.requiredConversions, 0);
  assert.deepEqual(semTicket.stages, []);
  assert.ok(semTicket.diagnostics.some((d) => d.code === "TICKET_INVALIDO"));

  const semMeta = calcularAscendente({ ...planoDoCanvas(), goalCents: 0 });
  assert.ok(semMeta.diagnostics.some((d) => d.code === "META_INVALIDA"));
});

test("funil sem etapa nenhuma é erro", () => {
  const r = calcularAscendente({ ...planoDoCanvas(), stages: [] });
  assert.ok(r.diagnostics.some((d) => d.code === "SEM_ETAPAS"));
});

test("taxa 0 e taxa 101 são erro, não infinito nem NaN", () => {
  const zero = calcularAscendente({
    ...planoDoCanvas(),
    stages: [{ id: "s1", label: "Proposta", rate: 0 }],
  });
  const invalida = zero.diagnostics.find((d) => d.code === "TAXA_INVALIDA");
  assert.equal(invalida?.targetId, "s1");
  assert.deepEqual(zero.stages, []);

  const acima = calcularAscendente({
    ...planoDoCanvas(),
    stages: [{ id: "s1", label: "Proposta", rate: 101 }],
  });
  assert.ok(acima.diagnostics.some((d) => d.code === "TAXA_INVALIDA"));
});

test("taxa de 100% em todas as etapas faz topo igual às conversões", () => {
  const r = calcularAscendente({
    ...planoDoCanvas(),
    stages: [
      { id: "s1", label: "A", rate: 100 },
      { id: "s2", label: "B", rate: 100 },
    ],
  });
  assert.equal(r.topVolume, 50);
  assert.equal(r.externalRate, 100);
});

test("volume astronômico vira erro em vez de card ilegível", () => {
  const r = calcularAscendente({
    ...planoDoCanvas(),
    goalCents: 100_000_000_00,
    stages: [{ id: "s1", label: "Proposta", rate: 0.01 }],
  });
  assert.ok(r.diagnostics.some((d) => d.code === "VOLUME_IRREAL"));
  assert.ok(LIMITE_VOLUME > 0);
});

test("valor em formato brasileiro vira centavos", () => {
  assert.equal(parseMoedaParaCentavos("50.000,00"), 5_000_000);
  assert.equal(parseMoedaParaCentavos("R$ 50.000,00"), 5_000_000);
  assert.equal(parseMoedaParaCentavos("1.234,5"), 123_450);
  assert.equal(parseMoedaParaCentavos("1234.56"), 123_456);
  assert.equal(parseMoedaParaCentavos("999"), 99_900);
  assert.equal(parseMoedaParaCentavos("0,07"), 7);
});

test("texto que não é número devolve null, e não NaN disfarçado de zero", () => {
  assert.equal(parseMoedaParaCentavos(""), null);
  assert.equal(parseMoedaParaCentavos("abc"), null);
  assert.equal(parseMoedaParaCentavos("-50"), null);
});
