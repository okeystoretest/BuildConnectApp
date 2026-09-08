import assert from "node:assert/strict";
import test from "node:test";
import { describeError } from "./describe-error";

/**
 * O invariante único: NUNCA lança.
 *
 * Quem chama é o `.catch()` de uma promessa de segundo plano. Uma exceção aqui
 * dentro não tem quem a pegue e encerra o processo do Node — trocando a falha
 * que o handler ia registrar por 502 para todos os usuários.
 */

test("Error vira a pilha, que diz de onde a promessa nasceu", () => {
  const erro = new Error("banco fora do ar");
  const texto = describeError(erro);
  assert.match(texto, /banco fora do ar/);
  assert.match(texto, /describe-error\.test/, "a pilha deveria citar o arquivo");
});

test("Error sem pilha cai na mensagem", () => {
  const erro = new Error("sem pilha");
  erro.stack = undefined;
  assert.equal(describeError(erro), "sem pilha");
});

test("rejeição com valor que não é Error continua legível", () => {
  // `Promise.reject("string")` e `throw 42` são legais em JavaScript, e o
  // Baileys rejeita com objeto simples em alguns caminhos.
  assert.equal(describeError("deu ruim"), "deu ruim");
  assert.equal(describeError(42), "42");
  assert.equal(describeError(null), "null");
  assert.equal(describeError(undefined), "undefined");
});

test("valor hostil não lança — degrada para texto genérico", () => {
  // O caso que motivou o try/catch: um objeto cuja conversão para texto lança.
  // Sem a proteção, a exceção nasceria DENTRO do handler da rejeição, fora de
  // qualquer ciclo de requisição, e derrubaria o processo.
  const hostil = {
    toString() {
      throw new Error("recusei virar texto");
    },
  };
  assert.equal(describeError(hostil), "(motivo ilegível)");
});

test("símbolo não lança", () => {
  // `${simbolo}` lança TypeError; `String(simbolo)` não. Se alguém trocar a
  // implementação por template literal, este teste pega.
  assert.equal(describeError(Symbol("qr")), "Symbol(qr)");
});

test("objeto sem prototype não lança", () => {
  // `Object.create(null)` não tem `toString`: `String(x)` lança TypeError.
  assert.equal(describeError(Object.create(null)), "(motivo ilegível)");
});
