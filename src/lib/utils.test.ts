import assert from "node:assert/strict";
import test from "node:test";
import { firstName, formatBytes, shortName } from "./utils";

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

/**
 * O degrau de GB nasceu com o teto de vídeo de 4 GB (28/10/2026): sem ele, o
 * limite aparecia como "4096.0 MB" no seletor de arquivo e na recusa.
 */
test("formatBytes sobe de unidade em KB, MB e GB", () => {
  assert.equal(formatBytes(0), "0 KB");
  assert.equal(formatBytes(-1), "0 KB");
  assert.equal(formatBytes(2048), "2 KB");
  assert.equal(formatBytes(5 * 1024 * 1024), "5.0 MB");
  assert.equal(formatBytes(4 * 1024 * 1024 * 1024), "4.0 GB");
});

test("formatBytes vira GB exatamente em 1024 MB, não antes", () => {
  // A fronteira importa: um vídeo de 1023 MB ainda é mais legível em MB, e
  // trocar a unidade cedo demais esconde a diferença entre 900 MB e 1,0 GB.
  assert.equal(formatBytes(1023 * 1024 * 1024), "1023.0 MB");
  assert.equal(formatBytes(1024 * 1024 * 1024), "1.0 GB");
});
