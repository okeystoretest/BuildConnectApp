import assert from "node:assert/strict";
import test from "node:test";
import {
  ANONYMITY_FLOOR,
  canEditStructure,
  canReopen,
  canRespond,
  formScopeFor,
  removalImpact,
  showsAggregate,
} from "./rules";
import type { FormDraft } from "@/types/form";

test("rascunho é sempre editável", () => {
  assert.equal(canEditStructure({ status: "RASCUNHO" }), true);
});

test("publicado é editável, MESMO com respostas", () => {
  // Mudou em 03/09/2026, a pedido. Antes a primeira resposta travava a
  // estrutura. A proteção não desapareceu: mudou de lugar. Em vez de recusar a
  // edição, `removalImpact` diz o que será destruído e a tela pergunta antes.
  assert.equal(canEditStructure({ status: "PUBLICADO" }), true);
});

test("encerrado não é editável — reabra antes", () => {
  // Encerrado é resultado congelado. Editá-lo mudaria o significado de um
  // número já lido. Reabrir cria uma rodada nova, que é onde estrutura nova
  // faz sentido.
  assert.equal(canEditStructure({ status: "ENCERRADO" }), false);
});

test("só o encerrado pode ser reaberto", () => {
  assert.equal(canReopen({ status: "ENCERRADO" }), true);
  assert.equal(canReopen({ status: "PUBLICADO" }), false);
  assert.equal(canReopen({ status: "RASCUNHO" }), false);
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

// ─── removalImpact ─────────────────────────────────────────────────────────
//
// A conta que decide se salvar destrói dado. É ela que substitui a antiga
// trava de edição, então é a que precisa de teste.

function draftWith(questions: { id: string; optionIds?: string[] }[]): FormDraft {
  return {
    id: "f1",
    title: "F",
    status: "PUBLICADO",
    anonymous: false,
    sections: [
      {
        id: "s1",
        title: "S",
        order: 0,
        questions: questions.map((q, i) => ({
          id: q.id,
          kind: "MULTIPLA_ESCOLHA",
          label: q.id,
          required: false,
          order: i,
          options: (q.optionIds ?? []).map((oid, oi) => ({
            id: oid,
            label: oid,
            order: oi,
          })),
        })),
      },
    ],
  };
}

test("rascunho idêntico ao banco não destrói nada", () => {
  const existing = {
    questions: [{ id: "q1", label: "P1", answers: 4 }],
    options: [{ id: "o1", label: "O1", chosen: 4 }],
  };
  assert.deepEqual(removalImpact(existing, draftWith([{ id: "q1", optionIds: ["o1"] }])), []);
});

test("apagar pergunta respondida é impacto", () => {
  const existing = {
    questions: [
      { id: "q1", label: "Como foi?", answers: 7 },
      { id: "q2", label: "Sobrevivente", answers: 3 },
    ],
    options: [],
  };
  assert.deepEqual(removalImpact(existing, draftWith([{ id: "q2" }])), [
    { kind: "pergunta", id: "q1", label: "Como foi?", affected: 7 },
  ]);
});

test("apagar pergunta SEM resposta não é impacto", () => {
  // Não há o que perder — avisar aqui seria ruído, e ruído faz o aviso que
  // importa ser ignorado.
  const existing = {
    questions: [{ id: "q1", label: "Nunca respondida", answers: 0 }],
    options: [],
  };
  assert.deepEqual(removalImpact(existing, draftWith([])), []);
});

test("apagar opção escolhida é impacto", () => {
  const existing = {
    questions: [{ id: "q1", label: "P1", answers: 5 }],
    options: [
      { id: "o1", label: "Sim", chosen: 5 },
      { id: "o2", label: "Não", chosen: 2 },
    ],
  };
  assert.deepEqual(removalImpact(existing, draftWith([{ id: "q1", optionIds: ["o1"] }])), [
    { kind: "opção", id: "o2", label: "Não", affected: 2 },
  ]);
});

test("apagar opção nunca escolhida não é impacto", () => {
  const existing = {
    questions: [{ id: "q1", label: "P1", answers: 5 }],
    options: [
      { id: "o1", label: "Sim", chosen: 5 },
      { id: "o2", label: "Ninguém marcou", chosen: 0 },
    ],
  };
  assert.deepEqual(removalImpact(existing, draftWith([{ id: "q1", optionIds: ["o1"] }])), []);
});

test("renomear pergunta não conta como remoção", () => {
  // O id é o que identifica; o rótulo é texto. Trocar o texto de uma pergunta
  // já respondida é edição legítima e não perde nada.
  const existing = { questions: [{ id: "q1", label: "Título antigo", answers: 9 }], options: [] };
  const draft = draftWith([{ id: "q1" }]);
  draft.sections[0]!.questions[0]!.label = "Título novo";
  assert.deepEqual(removalImpact(existing, draft), []);
});

test("perguntas vêm antes de opções no aviso", () => {
  // A tela lista na ordem recebida. Pergunta perdida é mais grave que opção
  // perdida, então aparece primeiro.
  const existing = {
    questions: [{ id: "q1", label: "P1", answers: 2 }],
    options: [{ id: "o1", label: "O1", chosen: 1 }],
  };
  const impacts = removalImpact(existing, draftWith([]));
  assert.equal(impacts.length, 2);
  assert.equal(impacts[0]!.kind, "pergunta");
  assert.equal(impacts[1]!.kind, "opção");
});
