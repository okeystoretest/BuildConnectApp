import assert from "node:assert/strict";
import test from "node:test";
import { calcularAscendente } from "./math";
import { planoDeAcao, topoPorAtividade } from "./plano-de-acao";
import type { FunnelInput } from "./types";

/**
 * O que se cobra do vendedor. A metodologia do canvas insiste que o vendedor
 * controla as causas — as atividades por etapa — e não o efeito, então o
 * número que importa na tela é "quantas oportunidades por dia", não a meta.
 *
 * O caso é o da auditoria de 30/09/2026: meta R$ 75.000, ticket R$ 2.140,65,
 * etapas 33% / 60% / 40%, 4 vendedores, 22 dias úteis.
 */
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

const EQUIPE = { vendedores: 4, diasUteis: 22 };

test("445 oportunidades com 4 vendedores e 22 dias dão 111 por vendedor e 5 por dia", () => {
  const esforco = planoDeAcao(calcularAscendente(planoDaAuditoria()), EQUIPE);
  assert.ok(esforco, "com equipe declarada há plano de ação");

  const topo = esforco[0];
  assert.equal(topo?.label, "Oportunidade");
  assert.equal(topo?.volume, 445);
  assert.equal(topo?.porVendedor, 111);
  assert.equal(topo?.porVendedorExato, 111.25);
  assert.equal(topo?.porVendedorDia, 5);
  assert.equal(topo?.porVendedorDiaExato, 5.06);
});

test("o esforço é derivado para TODA etapa, não só para a boca do funil", () => {
  const esforco = planoDeAcao(calcularAscendente(planoDaAuditoria()), EQUIPE);
  assert.equal(esforco?.length, 3);
  assert.deepEqual(
    esforco?.map((e) => [e.volume, e.porVendedor, e.porVendedorDia]),
    [
      [445, 111, 5],
      [147, 37, 2],
      [88, 22, 1],
    ],
  );
});

test("o valor exato acompanha o inteiro, porque 2 visitas por dia não fecham 147", () => {
  const esforco = planoDeAcao(calcularAscendente(planoDaAuditoria()), EQUIPE);
  // 1,67 visita por dia arredondada para 2 daria 2 × 4 × 22 = 176 visitas,
  // contra as 147 que o funil pede. O exato ao lado é o que impede a conta
  // errada de parecer certa.
  assert.equal(esforco?.[1]?.porVendedorDia, 2);
  assert.equal(esforco?.[1]?.porVendedorDiaExato, 1.67);
  assert.equal(esforco?.[1]?.porVendedorExato, 36.75);
});

test("sem equipe declarada não há plano de ação, e não há erro", () => {
  const resultado = calcularAscendente(planoDaAuditoria());
  assert.equal(planoDeAcao(resultado, null), null);
  // O funil em si continua calculado: é isso que mantém os funis salvos antes
  // de 30/09/2026 desenhando.
  assert.equal(resultado.topVolume, 445);
  assert.deepEqual(resultado.diagnostics, []);
});

test("vendedores ou dias não positivos devolvem null em vez de dividir por zero", () => {
  const resultado = calcularAscendente(planoDaAuditoria());
  assert.equal(planoDeAcao(resultado, { vendedores: 0, diasUteis: 22 }), null);
  assert.equal(planoDeAcao(resultado, { vendedores: 4, diasUteis: 0 }), null);
  assert.equal(planoDeAcao(resultado, { vendedores: -4, diasUteis: 22 }), null);
  assert.equal(planoDeAcao(resultado, { vendedores: 4, diasUteis: Number.NaN }), null);
});

test("funil que não pôde ser calculado não vira plano de ação vazio", () => {
  const semMeta = calcularAscendente({ ...planoDaAuditoria(), goalCents: 0 });
  assert.equal(planoDeAcao(semMeta, EQUIPE), null);
});

test("a alavanca de atividade diária reconstrói os 528 do canvas", () => {
  // 6 oportunidades por vendedor por dia, 22 dias, 4 vendedores.
  assert.equal(topoPorAtividade(6, EQUIPE), 528);
});

test("atividade diária fracionária arredonda o topo ao mais próximo", () => {
  assert.equal(topoPorAtividade(5.5, EQUIPE), 484);
  // 5,06 por dia é a cadência do próprio plano: devolve o topo de volta.
  assert.equal(topoPorAtividade(5.0568, EQUIPE), 445);
});

test("atividade diária sem equipe ou não positiva é null, não zero", () => {
  assert.equal(topoPorAtividade(6, null), null);
  assert.equal(topoPorAtividade(0, EQUIPE), null);
  assert.equal(topoPorAtividade(-6, EQUIPE), null);
  assert.equal(topoPorAtividade(6, { vendedores: 0, diasUteis: 22 }), null);
});
