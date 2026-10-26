import assert from "node:assert/strict";
import test from "node:test";
import {
  PERSONNEL_CATEGORY_KEYS,
  PERSONNEL_GROUPS,
  catalogCategory,
  catalogKeyByName,
  categoryLabel,
  collidesWithCatalog,
  countsForProgress,
  normalizeFolderName,
} from "./personnel-catalog";

/**
 * O catálogo de pastas, que a tela inteira do Departamento Pessoal assume.
 *
 * Chave repetida ou pasta sem rótulo não quebra nada na hora: quebra na
 * leitura, meses depois, com arquivo arquivado na pasta errada.
 */

test("as doze pastas da estrutura padronizada estão no catálogo", () => {
  assert.equal(PERSONNEL_CATEGORY_KEYS.length, 12);
  for (const esperada of [
    "foto-3x4",
    "ctps",
    "exame-medico-admissional",
    "rg",
    "cpf",
    "comprovante-residencia",
    "titulo-eleitor",
    "nis-pis",
    "certidao-nascimento-casamento",
    "certidao-filho-menor",
    "certidao-servico-militar",
    "dados-bancarios",
  ]) {
    assert.ok(PERSONNEL_CATEGORY_KEYS.includes(esperada), `falta a pasta ${esperada}`);
  }
});

test("nenhuma chave se repete", () => {
  // Chave repetida dividiria os arquivos de um mesmo documento em duas pastas.
  assert.equal(new Set(PERSONNEL_CATEGORY_KEYS).size, PERSONNEL_CATEGORY_KEYS.length);
});

test("toda pasta tem rótulo, e o rótulo não se repete", () => {
  const labels = PERSONNEL_GROUPS.flatMap((g) => g.categories.map((c) => c.label));
  for (const label of labels) assert.ok(label.trim().length > 0);
  assert.equal(new Set(labels).size, labels.length);
  for (const key of PERSONNEL_CATEGORY_KEYS) assert.ok(categoryLabel(key));
});

test("só filho menor e dados bancários ficam fora do progresso", () => {
  const opcionais = PERSONNEL_CATEGORY_KEYS.filter((k) => !countsForProgress(k));
  assert.deepEqual(opcionais.sort(), ["certidao-filho-menor", "dados-bancarios"]);
});

test("pasta EXTRA conta para o progresso", () => {
  // Foi o DHO que a criou para aquela pessoa; ele a quer preenchida.
  assert.equal(countsForProgress("Contrato de experiência"), true);
  assert.equal(catalogCategory("Contrato de experiência"), null);
});

test("só o exame médico tem validade automática, de um ano", () => {
  const comValidade = PERSONNEL_CATEGORY_KEYS.filter((k) => catalogCategory(k)?.validityDays);
  assert.deepEqual(comValidade, ["exame-medico-admissional"]);
  assert.equal(catalogCategory("exame-medico-admissional")?.validityDays, 365);
});

test("o nome de uma pasta do catálogo não vira pasta à mão", () => {
  // Senão o mesmo documento se dividiria entre a pasta modelo e a cópia.
  assert.equal(collidesWithCatalog("RG"), true);
  assert.equal(collidesWithCatalog("rg"), true);
  assert.equal(collidesWithCatalog("Dados Bancários"), true);
  assert.equal(collidesWithCatalog("Contrato de experiência"), false);
});

test("categoryLabel distingue pasta do catálogo de pasta criada à mão", () => {
  assert.equal(categoryLabel("exame-medico-admissional"), "Exame Médico Admissional");
  // É esta resposta nula que autoriza excluir a pasta e que a põe em
  // "Outras pastas" — uma chave do catálogo nunca pode cair aqui.
  assert.equal(categoryLabel("Advertências"), null);
});

test("normalizeFolderName colapsa espaços: ' RG  Antigo ' e 'RG Antigo' são a mesma pasta", () => {
  assert.equal(normalizeFolderName("  RG   Antigo  "), "RG Antigo");
  assert.equal(normalizeFolderName("\tAdvertências\n"), "Advertências");
  assert.equal(normalizeFolderName("   "), "");
  assert.equal(normalizeFolderName("x".repeat(80)).length, 60);
});

test("catalogKeyByName devolve a CHAVE — é por ela que a pasta excluída volta", () => {
  // Criar "RG" depois de excluí-la tem de restaurar a original, e a lista de
  // removidas guarda chave. Casar só o rótulo deixaria o nome digitado sem
  // caminho de volta.
  assert.equal(catalogKeyByName("rg"), "rg");
  assert.equal(catalogKeyByName("RG"), "rg");
  assert.equal(catalogKeyByName("Comprovante de Residência"), "comprovante-residencia");
  assert.equal(catalogKeyByName("Advertências"), null);
});
