import assert from "node:assert/strict";
import test from "node:test";
import {
  LIMITE_VOLUME,
  calcularAscendente,
  calcularDescendente,
  conversoesNecessarias,
  distribuirCanais,
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

test("descendente arredonda para BAIXO: 599 prospecções não viram 30 vendas", () => {
  // 599 -> 50% -> 299 -> 50% -> 149 -> 20% -> 29.
  const r = calcularDescendente(planoDoCanvas(), 599);
  assert.deepEqual(
    r.stages.map((s) => s.volume),
    [599, 299, 149],
  );
  assert.equal(r.requiredConversions, 29);
});

test("descendente projeta o faturamento pelo ticket do plano", () => {
  const r = calcularDescendente(planoDoCanvas(), 1000);
  assert.equal(r.requiredConversions, 50);
  assert.equal(r.projectedRevenueCents, 5_000_000);
});

test("descendente com topo zerado ou negativo é erro", () => {
  const r = calcularDescendente(planoDoCanvas(), 0);
  assert.ok(r.diagnostics.some((d) => d.code === "VOLUME_IRREAL"));
});

test("ida e volta: o topo do ascendente reconstrói as conversões no descendente", () => {
  const plano = planoDoCanvas();
  const subida = calcularAscendente(plano);
  const descida = calcularDescendente(plano, subida.topVolume);
  // O arredondamento é pessimista nos dois sentidos, então a volta nunca
  // promete MENOS do que a meta pedia — pode prometer exatamente.
  assert.ok(descida.requiredConversions >= subida.requiredConversions);
});

test("a fatia de cada canal vira número absoluto de prospecções", () => {
  const base = calcularAscendente(planoDoCanvas()); // topo 1000
  const r = distribuirCanais(base, [
    { id: "c1", label: "Base de clientes", share: 40 },
    { id: "c2", label: "Indicações", share: 20 },
    { id: "c3", label: "Google", share: 20 },
    { id: "c4", label: "Feiras", share: 10 },
    { id: "c5", label: "Redes sociais", share: 10 },
  ]);
  assert.deepEqual(
    r.channels.map((c) => c.volume),
    [400, 200, 200, 100, 100],
  );
  assert.equal(r.channelCoverage, 100);
  assert.deepEqual(r.diagnostics, []);
});

test("cobertura abaixo e acima de 100% dão avisos distintos, sem travar o cálculo", () => {
  const base = calcularAscendente(planoDoCanvas());
  const falta = distribuirCanais(base, [
    { id: "c1", label: "A", share: 40 },
    { id: "c2", label: "B", share: 20 },
    { id: "c3", label: "C", share: 10 },
    { id: "c4", label: "D", share: 10 },
    { id: "c5", label: "E", share: 5 },
  ]);
  assert.ok(falta.diagnostics.some((d) => d.code === "COBERTURA_INCOMPLETA"));
  assert.equal(falta.topVolume, 1000); // o cálculo continua de pé

  const sobra = distribuirCanais(base, [
    { id: "c1", label: "A", share: 60 },
    { id: "c2", label: "B", share: 30 },
    { id: "c3", label: "C", share: 15 },
    { id: "c4", label: "D", share: 5 },
    { id: "c5", label: "E", share: 5 },
  ]);
  assert.ok(sobra.diagnostics.some((d) => d.code === "COBERTURA_EXCEDIDA"));
});

test("menos de 5 canais avisa, mas não impede nada — o canvas pede no mínimo 5", () => {
  const base = calcularAscendente(planoDoCanvas());
  const r = distribuirCanais(base, [{ id: "c1", label: "Só um", share: 100 }]);
  const aviso = r.diagnostics.find((d) => d.code === "CANAIS_INSUFICIENTES");
  assert.equal(aviso?.severity, "aviso");
  assert.equal(r.channels[0]?.volume, 1000);
});

test("fatia negativa ou acima de 100 é erro do canal, e não entra na cobertura", () => {
  const base = calcularAscendente(planoDoCanvas());
  const r = distribuirCanais(base, [
    { id: "c1", label: "Bom", share: 50 },
    { id: "c2", label: "Ruim", share: -20 },
    { id: "c3", label: "Pior", share: 140 },
  ]);
  const invalidos = r.diagnostics.filter((d) => d.code === "FATIA_INVALIDA");
  assert.deepEqual(
    invalidos.map((d) => d.targetId),
    ["c2", "c3"],
  );
  // A cobertura conta só a fatia válida: um share negativo não "conserta"
  // um estouro por acidente.
  assert.equal(r.channelCoverage, 50);
});

test("funil sem canal nenhum não vira erro nem cobertura fantasma", () => {
  const base = calcularAscendente(planoDoCanvas());
  const r = distribuirCanais(base, []);
  assert.deepEqual(r.channels, []);
  assert.equal(r.channelCoverage, 0);
  assert.ok(r.diagnostics.every((d) => d.severity === "aviso"));
});

/*
 * Achados I1 e I2 da revisão final: a divisão em ponto flutuante erra por um
 * para taxas comuns. Fixados aqui com os casos exatos que a revisão mediu.
 */

test("taxa de 29% não inventa uma prospecção a mais (I1)", () => {
  // 290 conversões a 29% dão 1.000 exatos. `ceil(290 / 0.29)` dava 1001.
  const r = calcularAscendente({
    goalCents: 29_000_000,
    ticketCents: 100_000,
    stages: [{ id: "s1", label: "Proposta", rate: 29 }],
    channels: [],
  });
  assert.equal(r.requiredConversions, 290);
  assert.equal(r.stages[0]?.volume, 1000);
});

test("taxa fracionária de 0,7% também fecha exato (I1)", () => {
  const r = calcularAscendente({
    goalCents: 700_000,
    ticketCents: 100_000,
    stages: [{ id: "s1", label: "Proposta", rate: 0.7 }],
    channels: [],
  });
  assert.equal(r.requiredConversions, 7);
  assert.equal(r.stages[0]?.volume, 1000);
});

test("descendente a 2,3% não perde uma conversão (I2)", () => {
  // 3.000 a 2,3% dão 69 exatos. `floor(3000 * 2.3 / 100)` dava 68.
  const r = calcularDescendente(
    {
      goalCents: 5_000_000,
      ticketCents: 100_000,
      stages: [{ id: "s1", label: "Proposta", rate: 2.3 }],
      channels: [],
    },
    3000,
  );
  assert.equal(r.requiredConversions, 69);
});

test("nenhuma taxa de um décimo erra por um, em nenhum volume comum", () => {
  // A varredura que a revisão usou para achar o defeito vira teste: se a
  // aritmética voltar a ser em ponto flutuante, isto falha em massa.
  for (let bp = 1; bp <= 1000; bp += 1) {
    const rate = bp / 10;
    for (const conversoes of [7, 29, 69, 137, 290, 1000]) {
      const r = calcularAscendente({
        goalCents: conversoes * 100_000,
        ticketCents: 100_000,
        stages: [{ id: "s1", label: "P", rate }],
        channels: [],
      });
      if (r.diagnostics.length > 0) continue;
      const exato = (conversoes * 1000) / bp;
      assert.equal(
        r.stages[0]?.volume,
        Math.ceil(exato - 1e-9),
        `taxa ${rate}% com ${conversoes} conversões`,
      );
    }
  }
});
