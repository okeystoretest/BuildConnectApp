import assert from "node:assert/strict";
import test from "node:test";
import { trackedSubsectorIdsOf } from "./progress-scope";

/** Os subsetores rastreados (PADRAO) do setor da pessoa. */
const SETOR = ["almoxarifado", "costura", "corte"];

test("sem marcação no cadastro, o material é o do setor inteiro", () => {
  assert.deepEqual(trackedSubsectorIdsOf([], SETOR), SETOR);
});

test("com marcação, só o que foi marcado", () => {
  assert.deepEqual(trackedSubsectorIdsOf(["almoxarifado"], SETOR), ["almoxarifado"]);
  assert.deepEqual(trackedSubsectorIdsOf(["costura", "corte"], SETOR), ["costura", "corte"]);
});

test("marcação em subsetor de OUTRO setor não traz o acervo de lá", () => {
  // O vínculo pode atravessar setores; o material, não.
  assert.deepEqual(trackedSubsectorIdsOf(["almoxarifado", "ti"], SETOR), ["almoxarifado"]);
});

test("marcação só fora do setor rastreado devolve vazio, não o setor inteiro", () => {
  // É o caso de quem está marcado apenas numa vitrine: não há material a
  // concluir, e cair no setor todo diria o oposto da marcação.
  assert.deepEqual(trackedSubsectorIdsOf(["vitrine"], SETOR), []);
});

test("sem setor não há material, haja ou não marcação", () => {
  assert.deepEqual(trackedSubsectorIdsOf([], []), []);
  assert.deepEqual(trackedSubsectorIdsOf(["almoxarifado"], []), []);
});

test("a ordem segue a marcação, e não repete", () => {
  assert.deepEqual(trackedSubsectorIdsOf(["corte", "almoxarifado"], SETOR), [
    "corte",
    "almoxarifado",
  ]);
});
