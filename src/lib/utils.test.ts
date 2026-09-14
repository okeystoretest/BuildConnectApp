import assert from "node:assert/strict";
import test from "node:test";
import { firstName, shortName } from "./utils";

test("firstName devolve só o primeiro nome, sem espaços sobrando", () => {
  assert.equal(firstName("Maria Clara Souza"), "Maria");
  assert.equal(firstName("  João  "), "João");
});

test("firstName de nome vazio é vazio, não quebra", () => {
  assert.equal(firstName(""), "");
  assert.equal(firstName("   "), "");
});

test("shortName devolve os dois primeiros nomes", () => {
  assert.equal(shortName("Vivian Maria do Nascimento Xavier"), "Vivian Maria");
  assert.equal(shortName("Darliane Araújo Trajano"), "Darliane Araújo");
});

test("shortName de nome único ou vazio não inventa nada", () => {
  assert.equal(shortName("Madonna"), "Madonna");
  assert.equal(shortName("  "), "");
});
