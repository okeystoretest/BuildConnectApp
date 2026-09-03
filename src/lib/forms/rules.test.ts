import assert from "node:assert/strict";
import test from "node:test";
import {
  ANONYMITY_FLOOR,
  canEditStructure,
  canRespond,
  formScopeFor,
  showsAggregate,
} from "./rules";

test("rascunho é sempre editável", () => {
  assert.equal(canEditStructure({ status: "RASCUNHO", responseCount: 0 }), true);
  // Rascunho não pode ter resposta, mas a regra não depende disso.
  assert.equal(canEditStructure({ status: "RASCUNHO", responseCount: 3 }), true);
});

test("publicado sem resposta ainda é editável", () => {
  // Corrigir um erro de digitação antes de alguém responder é legítimo.
  assert.equal(canEditStructure({ status: "PUBLICADO", responseCount: 0 }), true);
});

test("a PRIMEIRA resposta trava a estrutura", () => {
  // Editar depois disto deixaria optionIds órfão e mudaria o significado do
  // que já foi respondido.
  assert.equal(canEditStructure({ status: "PUBLICADO", responseCount: 1 }), false);
});

test("encerrado nunca é editável", () => {
  assert.equal(canEditStructure({ status: "ENCERRADO", responseCount: 0 }), false);
});

test("responder exige publicado E atribuição pendente", () => {
  assert.equal(canRespond({ status: "PUBLICADO" }, { status: "PENDENTE" }), true);
});

test("quem já respondeu não responde de novo", () => {
  assert.equal(canRespond({ status: "PUBLICADO" }, { status: "CONCLUIDA" }), false);
});

test("sem atribuição não responde", () => {
  assert.equal(canRespond({ status: "PUBLICADO" }, null), false);
});

test("encerrado recusa mesmo quem estava pendente", () => {
  // Encerrar é o que congela o resultado para leitura.
  assert.equal(canRespond({ status: "ENCERRADO" }, { status: "PENDENTE" }), false);
});

test("rascunho não aceita resposta", () => {
  assert.equal(canRespond({ status: "RASCUNHO" }, { status: "PENDENTE" }), false);
});

test("formulário identificado exibe agregado com qualquer volume", () => {
  assert.equal(showsAggregate({ anonymous: false }, 1), true);
});

test("anônimo esconde o agregado abaixo do piso", () => {
  // Num grupo pequeno, o agregado É a resposta individual.
  assert.equal(showsAggregate({ anonymous: true }, ANONYMITY_FLOOR - 1), false);
  assert.equal(showsAggregate({ anonymous: true }, ANONYMITY_FLOOR), true);
});

test("ADMIN lê sem recorte", () => {
  assert.equal(formScopeFor({ role: "ADMIN", sectorId: "s1" }), null);
});

test("GESTOR é recortado pelo próprio setor", () => {
  assert.deepEqual(formScopeFor({ role: "GESTOR", sectorId: "s1" }), { ownerSectorId: "s1" });
});

test("GESTOR sem setor não alcança formulário nenhum", () => {
  // Sentinela em vez de null: `{ ownerSectorId: null }` casaria justamente com
  // os formulários corporativos do ADMIN, que o gestor não deve ler.
  const scope = formScopeFor({ role: "GESTOR", sectorId: null });
  assert.notEqual(scope, null);
  assert.notDeepEqual(scope, { ownerSectorId: null });
});

test("COLABORADOR não lê resultado nenhum", () => {
  assert.equal(formScopeFor({ role: "COLABORADOR", sectorId: "s1" }), "denied");
});
