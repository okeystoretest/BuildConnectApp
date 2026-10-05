import assert from "node:assert/strict";
import test from "node:test";
import {
  formatarData,
  formatarPercentual,
  formatarReais,
  formatarVolume,
  normalizarPercentualDigitado,
} from "./format";

/** A tela nunca formata moeda à mão: tudo passa por aqui. */

test("centavos viram reais no formato brasileiro", () => {
  assert.equal(formatarReais(5_000_000).replace(/\u00a0/g, " "), "R$ 50.000,00");
  assert.equal(formatarReais(7).replace(/\u00a0/g, " "), "R$ 0,07");
  assert.equal(formatarReais(0).replace(/\u00a0/g, " "), "R$ 0,00");
});

test("volume ganha separador de milhar", () => {
  assert.equal(formatarVolume(1000), "1.000");
  assert.equal(formatarVolume(50), "50");
  assert.equal(formatarVolume(1_000_000), "1.000.000");
});

test("a data de referência sai como mês e ano, que é o recorte do funil", () => {
  assert.equal(formatarData("2026-10-01T12:00:00.000Z"), "Outubro/2026");
});

test("data inválida não quebra a tela: devolve traço", () => {
  assert.equal(formatarData("não é data"), "—");
});

test("percentual sai com vírgula, como o resto dos números da tela", () => {
  assert.equal(formatarPercentual(5), "5,00%");
  assert.equal(formatarPercentual(33.333), "33,33%");
});

test("a terceira casa da porcentagem é reescrita, e não descartada em silêncio", () => {
  // O motor corre em pontos-base: 33,333% É 33,33%. O campo passa a dizer o
  // mesmo que o volume ao lado.
  assert.equal(normalizarPercentualDigitado("33,333"), "33,33");
  assert.equal(normalizarPercentualDigitado("33.333"), "33.33");
  // Arredonda ao mais próximo, como o resto da ferramenta.
  assert.equal(normalizarPercentualDigitado("33,336"), "33,34");
});

test("o que não perde casa decimal volta intacto", () => {
  assert.equal(normalizarPercentualDigitado("33"), "33");
  assert.equal(normalizarPercentualDigitado("33,33"), "33,33");
  // Nada de "33,00": forçar duas casas em quem digitou um inteiro é ruído.
  assert.equal(normalizarPercentualDigitado("40"), "40");
});

test("estado intermediário de digitação não é tocado", () => {
  for (const cru of ["", "   ", "1.", "1,", "-", "abc"]) {
    assert.equal(normalizarPercentualDigitado(cru), cru);
  }
});
