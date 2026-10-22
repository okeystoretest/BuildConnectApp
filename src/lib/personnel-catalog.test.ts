import assert from "node:assert/strict";
import test from "node:test";
import {
  PERSONNEL_GROUPS,
  categoryLabel,
  collidesWithCatalog,
  normalizeFolderName,
} from "./personnel-catalog";

test("as chaves do catálogo são únicas — chave repetida fundiria duas pastas", () => {
  const keys = PERSONNEL_GROUPS.flatMap((g) => g.categories.map((c) => c.key));
  assert.equal(new Set(keys).size, keys.length);
});

test("categoryLabel distingue pasta do catálogo de pasta criada à mão", () => {
  assert.equal(categoryLabel("aso"), "ASO (admissional, periódico, demissional, retorno)");
  // É esta resposta nula que autoriza excluir a pasta e que a põe em
  // "Outras pastas" — uma chave do catálogo nunca pode cair aqui.
  assert.equal(categoryLabel("Advertências"), null);
});

test("normalizeFolderName colapsa espaços: ' ASO  X ' e 'ASO X' são a mesma pasta", () => {
  assert.equal(normalizeFolderName("  ASO   X  "), "ASO X");
  assert.equal(normalizeFolderName("\tAdvertências\n"), "Advertências");
  assert.equal(normalizeFolderName("   "), "");
  assert.equal(normalizeFolderName("x".repeat(80)).length, 60);
});

test("pasta extra não pode duplicar uma obrigatória, por chave ou por rótulo", () => {
  assert.equal(collidesWithCatalog("aso"), true);
  assert.equal(collidesWithCatalog("ASO"), true);
  assert.equal(collidesWithCatalog("Comprovante de residência"), true);
  assert.equal(collidesWithCatalog("Advertências"), false);
});
