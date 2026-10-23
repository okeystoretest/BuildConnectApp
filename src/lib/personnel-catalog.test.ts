import assert from "node:assert/strict";
import test from "node:test";
import {
  PERSONNEL_GROUPS,
  catalogKeyByName,
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

test("catalogKeyByName devolve a CHAVE — é por ela que a pasta excluída volta", () => {
  // Criar "ASO" depois de excluí-la tem de restaurar a original, e a lista de
  // removidas guarda chave. Casar só o rótulo deixaria o nome digitado sem
  // caminho de volta.
  assert.equal(catalogKeyByName("aso"), "aso");
  assert.equal(catalogKeyByName("ASO (admissional, periódico, demissional, retorno)"), "aso");
  assert.equal(catalogKeyByName("Comprovante de Residência"), "comprovante-residencia");
  assert.equal(catalogKeyByName("Advertências"), null);
});

test("todo nome curto existe e cabe numa parada da trilha", () => {
  // A parada tem 6,5rem. Acima de ~26 caracteres o nome volta a estourar, e
  // foi para fugir disso que o campo existe — sem o teste, a próxima
  // categoria entra com o rótulo inteiro e o "…" volta.
  for (const group of PERSONNEL_GROUPS) {
    for (const c of group.categories) {
      assert.ok(c.short.trim().length > 0, `${c.key}: sem nome curto`);
      assert.ok(
        c.short.length <= 26,
        `${c.key}: nome curto com ${c.short.length} caracteres, não cabe`,
      );
      assert.ok(
        c.short.length <= c.label.length,
        `${c.key}: o "curto" é maior que o rótulo`,
      );
    }
  }
});
