import assert from "node:assert/strict";
import test from "node:test";
import { aggregate } from "./aggregate";
import type { FormAnswerInput, FormDraft } from "@/types/form";

const form: FormDraft = {
  id: "f1",
  title: "Clima",
  status: "PUBLICADO",
  anonymous: true,
  sections: [
    {
      id: "s1",
      title: "Seção",
      order: 0,
      questions: [
        {
          id: "q1",
          kind: "MULTIPLA_ESCOLHA",
          label: "Turno",
          required: true,
          order: 0,
          options: [
            { id: "o1", label: "Manhã", order: 0 },
            { id: "o2", label: "Tarde", order: 1 },
          ],
        },
        {
          id: "q2",
          kind: "ESCALA_LINEAR",
          label: "Satisfação",
          required: true,
          order: 1,
          options: [],
          scaleMin: 1,
          scaleMax: 5,
        },
        {
          id: "q3",
          kind: "PARAGRAFO",
          label: "Comentário",
          required: false,
          order: 2,
          options: [],
        },
      ],
    },
  ],
};

const responses: { answers: FormAnswerInput[] }[] = [
  { answers: [{ questionId: "q1", optionIds: ["o1"] }, { questionId: "q2", number: 5 }] },
  { answers: [{ questionId: "q1", optionIds: ["o1"] }, { questionId: "q2", number: 3 }] },
  {
    answers: [
      { questionId: "q1", optionIds: ["o2"] },
      { questionId: "q2", number: 4 },
      { questionId: "q3", text: "tudo certo" },
    ],
  },
];

test("conta as opções e calcula o percentual sobre quem respondeu a pergunta", () => {
  const [q1] = aggregate(form, responses);
  assert.equal(q1?.answered, 3);
  assert.deepEqual(q1?.options, [
    { optionId: "o1", label: "Manhã", count: 2, percent: 67 },
    { optionId: "o2", label: "Tarde", count: 1, percent: 33 },
  ]);
});

test("a escala vem na ordem 1→N, com os valores sem resposta zerados", () => {
  // A ordem carrega significado; ordenar por volume destruiria a leitura.
  const q2 = aggregate(form, responses)[1];
  assert.deepEqual(q2?.scale?.distribution, [
    { value: 1, count: 0 },
    { value: 2, count: 0 },
    { value: 3, count: 1 },
    { value: 4, count: 1 },
    { value: 5, count: 1 },
  ]);
  assert.equal(q2?.scale?.average, 4);
});

test("texto vira lista, não agregado", () => {
  const q3 = aggregate(form, responses)[2];
  assert.deepEqual(q3?.texts, ["tudo certo"]);
  assert.equal(q3?.answered, 1);
});

test("pergunta sem nenhuma resposta não divide por zero", () => {
  const vazio = aggregate(form, []);
  assert.equal(vazio[0]?.answered, 0);
  assert.deepEqual(vazio[0]?.options, [
    { optionId: "o1", label: "Manhã", count: 0, percent: 0 },
    { optionId: "o2", label: "Tarde", count: 0, percent: 0 },
  ]);
  assert.equal(vazio[1]?.scale?.average, null);
});

test("caixas de seleção contam cada opção marcada", () => {
  const multi: FormDraft = {
    ...form,
    sections: [
      {
        ...form.sections[0]!,
        questions: [{ ...form.sections[0]!.questions[0]!, kind: "CAIXAS_SELECAO" }],
      },
    ],
  };
  const [q] = aggregate(multi, [{ answers: [{ questionId: "q1", optionIds: ["o1", "o2"] }] }]);
  assert.equal(q?.answered, 1);
  assert.equal(q?.options?.[0]?.count, 1);
  assert.equal(q?.options?.[1]?.count, 1);
  // Percentual sobre respondentes, não sobre marcações: 1 de 1 marcou cada uma.
  assert.equal(q?.options?.[0]?.percent, 100);
});
