import assert from "node:assert/strict";
import test from "node:test";
import { firstName } from "./utils";

test("firstName devolve só o primeiro nome, sem espaços sobrando", () => {
  assert.equal(firstName("Maria Clara Souza"), "Maria");
  assert.equal(firstName("  João  "), "João");
});

test("firstName de nome vazio é vazio, não quebra", () => {
  assert.equal(firstName(""), "");
  assert.equal(firstName("   "), "");
});
