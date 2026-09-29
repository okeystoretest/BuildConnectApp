import assert from "node:assert/strict";
import test from "node:test";
import { lerIdentificador, lerStatus } from "./identificadores";

/**
 * Achado I3 da revisão final.
 *
 * Argumento de Server Action é desserializado do cliente: o tipo do
 * TypeScript some em runtime. Um `funnelId` enviado como `{ not: "" }` vira
 * um operador do Prisma e o `deleteMany` apaga o setor inteiro numa chamada.
 * Estes guardas existem para que nada além de texto chegue ao `where`.
 */

test("id de texto passa", () => {
  assert.equal(lerIdentificador("cmumqquh40001ukmgaj11burd"), "cmumqquh40001ukmgaj11burd");
});

test("objeto de operador do Prisma é recusado — é o vetor de apagar tudo", () => {
  assert.equal(lerIdentificador({ not: "" }), null);
  assert.equal(lerIdentificador({ contains: "" }), null);
  assert.equal(lerIdentificador({ gt: "" }), null);
});

test("nada que não seja texto não-vazio passa", () => {
  assert.equal(lerIdentificador(null), null);
  assert.equal(lerIdentificador(undefined), null);
  assert.equal(lerIdentificador(""), null);
  assert.equal(lerIdentificador("   "), null);
  assert.equal(lerIdentificador(123), null);
  assert.equal(lerIdentificador([]), null);
  assert.equal(lerIdentificador(["a"]), null);
  assert.equal(lerIdentificador(true), null);
});

test("id absurdamente longo é recusado antes de virar consulta", () => {
  assert.equal(lerIdentificador("x".repeat(200)), null);
});

test("status fora do enum é recusado, em vez de estourar no Prisma", () => {
  assert.equal(lerStatus("ATIVO"), "ATIVO");
  assert.equal(lerStatus("RASCUNHO"), "RASCUNHO");
  assert.equal(lerStatus("ARQUIVADO"), "ARQUIVADO");
  assert.equal(lerStatus("ativo"), null);
  assert.equal(lerStatus("DROP"), null);
  assert.equal(lerStatus({ not: "" }), null);
  assert.equal(lerStatus(null), null);
});
