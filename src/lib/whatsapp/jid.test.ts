import assert from "node:assert/strict";
import test from "node:test";
import { jidCandidates, toWhatsappJid } from "./jid";

test("celular vira JID com código do país", () => {
  assert.equal(toWhatsappJid("11987654321"), "5511987654321@s.whatsapp.net");
});

test("fixo também vira JID", () => {
  assert.equal(toWhatsappJid("1134567890"), "551134567890@s.whatsapp.net");
});

test("aceita número com máscara, normalizando antes", () => {
  // O cadastro guarda dígitos, mas nada impede um número vindo de outro lugar.
  assert.equal(toWhatsappJid("(11) 98765-4321"), "5511987654321@s.whatsapp.net");
});

test("número inválido não vira JID", () => {
  // Devolver null em vez de lançar: um cadastro torto não pode derrubar o
  // envio para os outros destinatários.
  assert.equal(toWhatsappJid("119876543"), null);
  assert.equal(toWhatsappJid("abc"), null);
});

test("ausência de telefone não vira JID", () => {
  // Os usuários cadastrados antes do campo existir têm phone nulo.
  assert.equal(toWhatsappJid(null), null);
  assert.equal(toWhatsappJid(undefined), null);
  assert.equal(toWhatsappJid(""), null);
});

test("celular gera DUAS candidaturas: com e sem o nono dígito", () => {
  // Números registrados no WhatsApp antes de 2012 seguem gravados sem o 9.
  // Mandar só para a forma nova não entrega a essas contas.
  assert.deepEqual(jidCandidates("11987654321"), [
    "5511987654321@s.whatsapp.net",
    "551187654321@s.whatsapp.net",
  ]);
});

test("fixo gera uma candidatura só", () => {
  // Não há nono dígito para tirar de um fixo.
  assert.deepEqual(jidCandidates("1134567890"), ["551134567890@s.whatsapp.net"]);
});

test("número inválido não gera candidatura alguma", () => {
  assert.deepEqual(jidCandidates("119876543"), []);
  assert.deepEqual(jidCandidates(null), []);
});
