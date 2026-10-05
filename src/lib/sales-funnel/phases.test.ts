import assert from "node:assert/strict";
import test from "node:test";
import { FASES, corDaFaixa, faseDaEtapa, gruposDeFase } from "./phases";

/**
 * A fase é DERIVADA da posição. Não existe coluna de fase no banco, e não
 * pode existir divergência entre o que o desenho pinta e o que a lista de
 * etapas rotula: os dois chamam estas funções.
 */

test("com três etapas sai uma de cada fase", () => {
  assert.equal(faseDaEtapa(0, 3), "TOFU");
  assert.equal(faseDaEtapa(1, 3), "MOFU");
  assert.equal(faseDaEtapa(2, 3), "BOFU");
});

test("com seis etapas o meio inteiro é MoFu", () => {
  const fases = [0, 1, 2, 3, 4, 5].map((i) => faseDaEtapa(i, 6));
  assert.deepEqual(fases, ["TOFU", "MOFU", "MOFU", "MOFU", "MOFU", "BOFU"]);
});

test("a primeira é sempre topo e a última sempre fundo, de 2 a 6 etapas", () => {
  for (let total = 2; total <= 6; total += 1) {
    assert.equal(faseDaEtapa(0, total), "TOFU", `total ${total}`);
    assert.equal(faseDaEtapa(total - 1, total), "BOFU", `total ${total}`);
  }
});

test("uma etapa só é topo: sem etapa seguinte não há fundo a marcar", () => {
  assert.equal(faseDaEtapa(0, 1), "TOFU");
});

test("índice fora da lista não quebra o desenho", () => {
  assert.equal(faseDaEtapa(-1, 4), "TOFU");
  assert.equal(faseDaEtapa(9, 4), "BOFU");
  assert.equal(faseDaEtapa(0, 0), "TOFU");
});

test("cada fase traz os dois nomes do canvas e a sigla do cronograma", () => {
  assert.equal(FASES.TOFU.fase, "Atração");
  assert.equal(FASES.MOFU.fase, "Relacionamento");
  assert.equal(FASES.BOFU.fase, "Fechamento");
  assert.equal(FASES.TOFU.sigla, "ToFu");
  assert.equal(FASES.MOFU.sigla, "MoFu");
  assert.equal(FASES.BOFU.sigla, "BoFu");
});

test("a cor da faixa é a da sua fase", () => {
  assert.equal(corDaFaixa(0, 3), FASES.TOFU.cor);
  assert.equal(corDaFaixa(2, 3), FASES.BOFU.cor);
});

test("etapas de meio recebem tons distintos, para a divisa entre elas não sumir", () => {
  const meio = [1, 2, 3, 4].map((i) => corDaFaixa(i, 6));
  assert.equal(new Set(meio).size, meio.length);
  // Todos continuam sendo tons do âmbar do MoFu, e não cores de outra fase.
  for (const cor of meio) {
    assert.notEqual(cor, FASES.TOFU.cor);
    assert.notEqual(cor, FASES.BOFU.cor);
  }
});

test("a cor é estável: mesma posição, mesma cor, sempre", () => {
  assert.equal(corDaFaixa(2, 5), corDaFaixa(2, 5));
});

test("os grupos cobrem todas as etapas, em ordem e sem buraco", () => {
  const grupos = gruposDeFase(6);
  assert.deepEqual(
    grupos.map((g) => g.fase),
    ["TOFU", "MOFU", "BOFU"],
  );
  assert.deepEqual(
    grupos.map((g) => [g.inicio, g.quantidade]),
    [
      [0, 1],
      [1, 4],
      [5, 1],
    ],
  );
});

test("sem etapas não há grupo a desenhar", () => {
  assert.deepEqual(gruposDeFase(0), []);
});

test("com duas etapas o MoFu não vira um grupo vazio", () => {
  assert.deepEqual(
    gruposDeFase(2).map((g) => g.fase),
    ["TOFU", "BOFU"],
  );
});
