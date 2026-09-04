import assert from "node:assert/strict";
import test from "node:test";
import { validateSubmission } from "./validation";
import type { FormDraft, FormQuestionDraft } from "@/types/form";

function question(patch: Partial<FormQuestionDraft> = {}): FormQuestionDraft {
  return {
    id: "q1",
    kind: "TEXTO_CURTO",
    label: "Pergunta",
    required: false,
    order: 0,
    options: [],
    ...patch,
  };
}

function form(questions: FormQuestionDraft[]): FormDraft {
  return {
    id: "f1",
    title: "Formulário",
    status: "PUBLICADO",
    anonymous: false,
    currentRound: 1,
    sections: [{ id: "s1", title: "Seção", order: 0, questions }],
  };
}

test("texto válido passa", () => {
  const res = validateSubmission(form([question()]), [{ questionId: "q1", text: "oi" }]);
  assert.deepEqual(res, { ok: true });
});

test("obrigatória sem resposta é recusada", () => {
  const res = validateSubmission(form([question({ required: true })]), []);
  assert.equal(res.ok, false);
});

test("obrigatória com texto em branco é recusada", () => {
  // String de espaços não é resposta.
  const res = validateSubmission(form([question({ required: true })]), [
    { questionId: "q1", text: "   " },
  ]);
  assert.equal(res.ok, false);
});

test("opcional sem resposta passa", () => {
  assert.deepEqual(validateSubmission(form([question()]), []), { ok: true });
});

test("resposta a pergunta inexistente é recusada", () => {
  const res = validateSubmission(form([question()]), [{ questionId: "fantasma", text: "x" }]);
  assert.equal(res.ok, false);
});

test("múltipla escolha aceita exatamente uma opção", () => {
  const q = question({
    kind: "MULTIPLA_ESCOLHA",
    options: [
      { id: "o1", label: "A", order: 0 },
      { id: "o2", label: "B", order: 1 },
    ],
  });
  assert.deepEqual(validateSubmission(form([q]), [{ questionId: "q1", optionIds: ["o1"] }]), {
    ok: true,
  });
  const duas = validateSubmission(form([q]), [{ questionId: "q1", optionIds: ["o1", "o2"] }]);
  assert.equal(duas.ok, false);
});

test("caixas de seleção aceitam várias opções", () => {
  const q = question({
    kind: "CAIXAS_SELECAO",
    options: [
      { id: "o1", label: "A", order: 0 },
      { id: "o2", label: "B", order: 1 },
    ],
  });
  const res = validateSubmission(form([q]), [{ questionId: "q1", optionIds: ["o1", "o2"] }]);
  assert.deepEqual(res, { ok: true });
});

test("opção inexistente é recusada", () => {
  const q = question({
    kind: "MULTIPLA_ESCOLHA",
    options: [{ id: "o1", label: "A", order: 0 }],
  });
  const res = validateSubmission(form([q]), [{ questionId: "q1", optionIds: ["o9"] }]);
  assert.equal(res.ok, false);
});

test("texto enviado a pergunta de escala é recusado", () => {
  const q = question({ kind: "ESCALA_LINEAR", scaleMin: 1, scaleMax: 5 });
  const res = validateSubmission(form([q]), [{ questionId: "q1", text: "quatro" }]);
  assert.equal(res.ok, false);
});

test("escala dentro do intervalo passa; fora é recusada", () => {
  const q = question({ kind: "ESCALA_LINEAR", scaleMin: 1, scaleMax: 5 });
  assert.deepEqual(validateSubmission(form([q]), [{ questionId: "q1", number: 5 }]), { ok: true });
  assert.equal(validateSubmission(form([q]), [{ questionId: "q1", number: 6 }]).ok, false);
  assert.equal(validateSubmission(form([q]), [{ questionId: "q1", number: 0 }]).ok, false);
});

test("escala com valor fracionário é recusada", () => {
  const q = question({ kind: "ESCALA_LINEAR", scaleMin: 1, scaleMax: 5 });
  assert.equal(validateSubmission(form([q]), [{ questionId: "q1", number: 3.5 }]).ok, false);
});

test("duas respostas para a mesma pergunta são recusadas", () => {
  const res = validateSubmission(form([question()]), [
    { questionId: "q1", text: "a" },
    { questionId: "q1", text: "b" },
  ]);
  assert.equal(res.ok, false);
});
