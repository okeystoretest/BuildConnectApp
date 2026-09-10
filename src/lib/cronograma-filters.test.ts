import assert from "node:assert/strict";
import test from "node:test";
import { matchesBrand } from "./cronograma-filters";

/**
 * Contrato do filtro de marca. O caso que mais importa é o do card SEM marca:
 * ele permanece visível sob qualquer seleção, e é justamente o que alguém
 * "simplificando" o filtro para um `includes` apagaria sem notar.
 */

test("seleção vazia não filtra nada", () => {
  assert.equal(matchesBrand("OKEY", []), true);
  assert.equal(matchesBrand("LOV_CLUB", []), true);
  assert.equal(matchesBrand(null, []), true);
});

test("marca selecionada mostra apenas ela", () => {
  assert.equal(matchesBrand("OKEY", ["OKEY"]), true);
  assert.equal(matchesBrand("LOV_CLUB", ["OKEY"]), false);
});

test("card sem marca permanece visível sob qualquer seleção", () => {
  assert.equal(matchesBrand(null, ["OKEY"]), true);
  assert.equal(matchesBrand(undefined, ["LOV_CLUB"]), true);
  assert.equal(matchesBrand("", ["OKEY", "LOV_CLUB"]), true);
});

test("valor irreconhecível conta como sem marca e permanece visível", () => {
  assert.equal(matchesBrand("MARCA_QUE_NAO_EXISTE", ["OKEY"]), true);
  assert.equal(matchesBrand(42, ["OKEY"]), true);
});

test("seleção múltipla aceita qualquer uma das marcas marcadas", () => {
  assert.equal(matchesBrand("OKEY", ["OKEY", "LOV_CLUB"]), true);
  assert.equal(matchesBrand("LOV_CLUB", ["OKEY", "LOV_CLUB"]), true);
});

test("a normalização de resolveBrand vale para o filtro", () => {
  assert.equal(matchesBrand("lov club", ["LOV_CLUB"]), true);
  assert.equal(matchesBrand("okey", ["LOV_CLUB"]), false);
});
