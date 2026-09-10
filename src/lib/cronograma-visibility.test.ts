import assert from "node:assert/strict";
import test from "node:test";
import { visibilityForSlug } from "./cronograma-visibility";

/**
 * Contrato de alcance do Cronograma.
 *
 * A leitura em `cronograma-data` filtra por `visibility`, então é esta função
 * — e só ela — que decide quem enxerga o quê. Marketing e Criação publicam
 * para a base inteira; Vendas mantém agenda pessoal.
 */

test("Marketing publica para toda a base", () => {
  assert.equal(visibilityForSlug("marketing"), "SHARED");
});

test("Criação publica para toda a base, para que Vendas enxergue", () => {
  assert.equal(visibilityForSlug("criacao"), "SHARED");
});

test("Vendas continua criando agenda pessoal", () => {
  assert.equal(visibilityForSlug("vendas"), "PRIVATE");
});

test("qualquer outra aba é privada por padrão", () => {
  assert.equal(visibilityForSlug("rh"), "PRIVATE");
  assert.equal(visibilityForSlug(""), "PRIVATE");
});
