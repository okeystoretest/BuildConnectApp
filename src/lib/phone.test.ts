import assert from "node:assert/strict";
import test from "node:test";
import { formatPhone, isValidPhone, normalizePhone } from "./phone";

test("normalizar tira máscara e deixa só dígitos", () => {
  assert.equal(normalizePhone("(11) 98765-4321"), "11987654321");
  assert.equal(normalizePhone("11 98765 4321"), "11987654321");
  assert.equal(normalizePhone("11.98765.4321"), "11987654321");
});

test("normalizar descarta o código do país", () => {
  // Quem copia do WhatsApp cola com +55. Guardar o 55 faria dois cadastros do
  // mesmo número parecerem diferentes.
  assert.equal(normalizePhone("+55 11 98765-4321"), "11987654321");
  assert.equal(normalizePhone("5511987654321"), "11987654321");
  // Fixo com país: 12 dígitos.
  assert.equal(normalizePhone("+55 11 3456-7890"), "1134567890");
});

test("normalizar não confunde DDD 55 com código do país", () => {
  // 5511987654321 tem 13 dígitos e começa em 55 → o 55 é país.
  // 55987654321 tem 11 → é o DDD do Rio Grande do Sul.
  assert.equal(normalizePhone("(55) 98765-4321"), "55987654321");
});

test("celular de 11 dígitos é válido", () => {
  assert.equal(isValidPhone("11987654321"), true);
  assert.equal(isValidPhone("85991234567"), true);
});

test("fixo de 10 dígitos é válido", () => {
  assert.equal(isValidPhone("1134567890"), true);
});

test("número curto ou longo demais é recusado", () => {
  assert.equal(isValidPhone("119876543"), false, "9 dígitos");
  assert.equal(isValidPhone("119876543210"), false, "12 dígitos");
  assert.equal(isValidPhone(""), false);
});

test("DDD inexistente é recusado", () => {
  // Não há DDD começando em 0 nem menor que 11.
  assert.equal(isValidPhone("01987654321"), false);
  assert.equal(isValidPhone("10987654321"), false);
});

test("celular de 11 dígitos precisa do 9 na frente", () => {
  // Desde 2016 todo celular tem 9 dígitos começando em 9. Um 11-dígitos sem
  // ele é quase sempre fixo digitado com um algarismo a mais.
  assert.equal(isValidPhone("11887654321"), false);
});

test("formatar devolve a máscara certa para cada tamanho", () => {
  assert.equal(formatPhone("11987654321"), "(11) 98765-4321");
  assert.equal(formatPhone("1134567890"), "(11) 3456-7890");
});

test("formatar não estraga o que não reconhece", () => {
  // Um número gravado antes desta regra não pode sumir da tela por não caber
  // no molde. Melhor exibir cru do que exibir errado.
  assert.equal(formatPhone("123"), "123");
  assert.equal(formatPhone(""), "");
});
