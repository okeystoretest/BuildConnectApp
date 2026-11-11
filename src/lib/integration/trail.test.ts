import { test } from "node:test";
import assert from "node:assert/strict";
import { canConclude, filmStates } from "./trail";

const films = [{ id: "a" }, { id: "b" }, { id: "c" }];

test("sem nada concluído, só o primeiro está liberado", () => {
  assert.deepEqual(filmStates(films, new Set()), ["LIBERADO", "TRANCADO", "TRANCADO"]);
});

test("concluir um destrava o seguinte, e só ele", () => {
  assert.deepEqual(filmStates(films, new Set(["a"])), ["CONCLUIDO", "LIBERADO", "TRANCADO"]);
});

test("trilha inteira concluída", () => {
  assert.deepEqual(filmStates(films, new Set(["a", "b", "c"])), [
    "CONCLUIDO",
    "CONCLUIDO",
    "CONCLUIDO",
  ]);
});

/**
 * O caso que o atacante tenta: forjar a conclusão do último sem passar pelos
 * anteriores. O buraco do meio NÃO pode liberar o que vem depois dele.
 */
test("pular a fila não destrava o que ficou para trás", () => {
  assert.deepEqual(filmStates(films, new Set(["c"])), ["LIBERADO", "TRANCADO", "CONCLUIDO"]);
  assert.equal(canConclude(films, new Set(["c"]), "b"), false);
});

test("canConclude recusa filme trancado, concluído e inexistente", () => {
  assert.equal(canConclude(films, new Set(), "a"), true);
  assert.equal(canConclude(films, new Set(), "b"), false);
  assert.equal(canConclude(films, new Set(["a"]), "a"), false);
  assert.equal(canConclude(films, new Set(), "inexistente"), false);
});

test("lista vazia não quebra", () => {
  assert.deepEqual(filmStates([], new Set()), []);
  assert.equal(canConclude([], new Set(), "a"), false);
});
