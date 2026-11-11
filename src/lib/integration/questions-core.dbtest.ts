import assert from "node:assert/strict";
import test, { after } from "node:test";
import { prisma } from "@/lib/db/prisma";
import { readQuestions, saveQuestionsFor } from "./questions-core";
import type { QuestionDraft } from "@/types/integration";

/**
 * Testes contra um Postgres DE VERDADE.
 *
 * O que se prova aqui é o que nenhum teste puro alcança: que editar um
 * questionário já respondido PRESERVA as respostas das perguntas mantidas.
 * Enquanto o editor apagasse e recriasse a estrutura, essa afirmação seria
 * falsa e ninguém veria — o histórico de tentativas do convidado ficaria com
 * buracos silenciosos.
 */

const MARK = "#DBTEST-PERGUNTAS";
const assets: string[] = [];
const guests: string[] = [];

async function makeFilm(questionCount = 2): Promise<string> {
  const asset = await prisma.integrationAsset.create({
    data: { kind: "FILME", title: `Filme${MARK}`, order: 990 },
    select: { id: true },
  });
  assets.push(asset.id);

  for (let i = 0; i < questionCount; i += 1) {
    await prisma.integrationQuestion.create({
      data: {
        assetId: asset.id,
        label: `Pergunta ${i + 1} original`,
        order: i,
        options: {
          create: [
            { label: "A", order: 0, correct: true },
            { label: "B", order: 1, correct: false },
          ],
        },
      },
    });
  }
  return asset.id;
}

/** Uma tentativa do convidado respondendo tudo, para haver o que perder. */
async function answerAll(assetId: string): Promise<string> {
  const guest = await prisma.integrationGuest.create({
    data: { token: `tk-${Date.now()}-${Math.random()}`, fullName: `Convidado${MARK}` },
    select: { id: true },
  });
  guests.push(guest.id);

  const perguntas = await prisma.integrationQuestion.findMany({
    where: { assetId },
    select: { id: true, options: { select: { id: true } } },
  });

  await prisma.integrationAttempt.create({
    data: {
      guestId: guest.id,
      assetId,
      correctCount: perguntas.length,
      totalCount: perguntas.length,
      passed: true,
      answers: {
        create: perguntas.map((q) => ({ questionId: q.id, optionId: q.options[0]!.id })),
      },
    },
  });
  return guest.id;
}

/** O rascunho que mantém tudo como está, com os ids atuais. */
async function draftOf(assetId: string): Promise<QuestionDraft[]> {
  return (await readQuestions(assetId)).questions;
}

after(async () => {
  await prisma.integrationAsset.deleteMany({ where: { id: { in: assets } } });
  await prisma.integrationGuest.deleteMany({ where: { id: { in: guests } } });
  await prisma.$disconnect();
});

// ─── Validação ─────────────────────────────────────────────────────────────

test("pergunta sem alternativa correta é recusada", async () => {
  const assetId = await makeFilm(1);
  const draft = await draftOf(assetId);
  draft[0]!.options = draft[0]!.options.map((o) => ({ ...o, correct: false }));

  const res = await saveQuestionsFor(assetId, draft);
  assert.equal(res.ok, false);
  assert.match(res.error ?? "", /exatamente uma alternativa correta/i);
});

test("duas corretas na mesma pergunta é recusado", async () => {
  const assetId = await makeFilm(1);
  const draft = await draftOf(assetId);
  draft[0]!.options = draft[0]!.options.map((o) => ({ ...o, correct: true }));

  const res = await saveQuestionsFor(assetId, draft);
  assert.equal(res.ok, false);
  assert.match(res.error ?? "", /exatamente uma alternativa correta/i);
});

test("menos de duas alternativas é recusado", async () => {
  const assetId = await makeFilm(1);
  const draft = await draftOf(assetId);
  draft[0]!.options = [draft[0]!.options[0]!];

  const res = await saveQuestionsFor(assetId, draft);
  assert.equal(res.ok, false);
  assert.match(res.error ?? "", /duas alternativas/i);
});

// ─── O teste que motiva a atualização no lugar ─────────────────────────────

test("renomear enunciado e alternativa PRESERVA as respostas", async () => {
  const assetId = await makeFilm(2);
  const guestId = await answerAll(assetId);
  const antes = await prisma.integrationAnswer.count({ where: { attempt: { guestId } } });
  assert.equal(antes, 2);

  const draft = await draftOf(assetId);
  draft[0]!.label = "Enunciado reescrito, bem diferente do anterior";
  draft[0]!.options[0]!.label = "Alternativa reescrita";

  const res = await saveQuestionsFor(assetId, draft);
  assert.equal(res.ok, true, res.error);

  // Compara por ID, nunca por rótulo: renomear é edição legítima e não pode
  // ser lido como "apagou uma e criou outra".
  assert.equal(await prisma.integrationAnswer.count({ where: { attempt: { guestId } } }), 2);
  const relido = await draftOf(assetId);
  assert.equal(relido[0]!.label, "Enunciado reescrito, bem diferente do anterior");
  assert.equal(relido[0]!.options[0]!.label, "Alternativa reescrita");
});

test("trocar o gabarito não mexe na nota já gravada", async () => {
  const assetId = await makeFilm(1);
  const guestId = await answerAll(assetId);

  const draft = await draftOf(assetId);
  draft[0]!.options = [
    { ...draft[0]!.options[0]!, correct: false },
    { ...draft[0]!.options[1]!, correct: true },
  ];
  assert.equal((await saveQuestionsFor(assetId, draft)).ok, true);

  const attempt = await prisma.integrationAttempt.findFirst({
    where: { guestId },
    select: { correctCount: true, passed: true },
  });
  // A pessoa respondeu o que estava escrito na tela dela. Reprovar
  // retroativamente seria mudar a regra depois do jogo.
  assert.deepEqual({ c: attempt?.correctCount, p: attempt?.passed }, { c: 1, p: true });
});

// ─── Perda de dado ─────────────────────────────────────────────────────────

test("remover pergunta respondida é recusado, dizendo o que se perde", async () => {
  const assetId = await makeFilm(2);
  await answerAll(assetId);

  const draft = await draftOf(assetId);
  const res = await saveQuestionsFor(assetId, [draft[0]!]);

  assert.equal(res.ok, false);
  assert.equal(res.removals?.length, 1);
  assert.equal(res.removals?.[0]?.kind, "pergunta");
  assert.equal(res.removals?.[0]?.affected, 1);
  // Nada foi gravado: as duas perguntas continuam lá.
  assert.equal((await draftOf(assetId)).length, 2);
});

test("confirmado, remove de verdade e leva as respostas junto", async () => {
  const assetId = await makeFilm(2);
  const guestId = await answerAll(assetId);

  const draft = await draftOf(assetId);
  const res = await saveQuestionsFor(assetId, [draft[0]!], true);

  assert.equal(res.ok, true, res.error);
  assert.equal((await draftOf(assetId)).length, 1);
  assert.equal(await prisma.integrationAnswer.count({ where: { attempt: { guestId } } }), 1);
});

test("remover pergunta que ninguém respondeu não pede confirmação", async () => {
  const assetId = await makeFilm(2);

  const draft = await draftOf(assetId);
  const res = await saveQuestionsFor(assetId, [draft[0]!]);

  // Sem resposta não há perda, e avisar sobre isso seria ruído.
  assert.equal(res.ok, true, res.error);
  assert.equal((await draftOf(assetId)).length, 1);
});

test("adicionar pergunta nova convive com as antigas, na ordem do rascunho", async () => {
  const assetId = await makeFilm(1);
  const draft = await draftOf(assetId);

  const res = await saveQuestionsFor(assetId, [
    { label: "Pergunta nova, inserida antes da original", options: [
      { label: "Certa", correct: true },
      { label: "Errada", correct: false },
    ] },
    ...draft,
  ]);

  assert.equal(res.ok, true, res.error);
  const relido = await draftOf(assetId);
  assert.equal(relido.length, 2);
  assert.match(relido[0]!.label, /inserida antes/);
  assert.match(relido[1]!.label, /original/);
});
