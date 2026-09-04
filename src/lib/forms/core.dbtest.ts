import assert from "node:assert/strict";
import test, { after } from "node:test";
import { prisma } from "@/lib/db/prisma";
import {
  DELETE_CONFIRMATION,
  deleteFormFor,
  publishFormFor,
  reopenFormFor,
  saveFormFor,
  closeFormFor,
  type FormActor,
} from "./core";
import { assignedFormFor, submitResponseFor } from "./response-core";
import { formResultsInScope } from "./data-core";
import type { FormDraft } from "@/types/form";

/**
 * Testes contra um Postgres DE VERDADE.
 *
 * Rodam com `npm run test:db`, e não com `npm test`, de propósito: `npm test`
 * precisa continuar funcionando em máquina sem banco — foi assim o projeto
 * inteiro, e é assim em qualquer lugar que só compile.
 *
 * O que se prova aqui é o que nenhum teste puro alcança: que salvar um
 * formulário respondido PRESERVA as respostas. Enquanto `saveForm` apagava e
 * recriava a estrutura, essa afirmação era falsa e ninguém veria.
 */

const ADMIN: FormActor = { id: "", role: "ADMIN", sectorId: null };

/** Usuários descartáveis, marcados para a limpeza do fim não errar o alvo. */
const MARK = "#DBTEST";
const created: string[] = [];

async function makeUser(name: string): Promise<string> {
  const user = await prisma.user.create({
    data: {
      username: `${name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${MARK}`,
      fullName: `${name} (teste)`,
      passwordHash: "x",
      role: "COLABORADOR",
    },
    select: { id: true },
  });
  return user.id;
}

async function makeForm(title: string): Promise<string> {
  const form = await prisma.form.create({
    data: { title: `${title}${MARK}`, ownerSectorId: null },
    select: { id: true },
  });
  created.push(form.id);
  return form.id;
}

/** Rascunho com N perguntas de escolha única, ids estáveis e previsíveis. */
function draftOf(formId: string, questionIds: string[]): FormDraft {
  return {
    id: formId,
    title: "Formulário de teste",
    status: "RASCUNHO",
    anonymous: false,
    currentRound: 1,
    sections: [
      {
        id: `${formId}-s1`,
        title: "Seção 1",
        order: 0,
        questions: questionIds.map((qid, i) => ({
          id: `${formId}-${qid}`,
          kind: "MULTIPLA_ESCOLHA",
          label: `Pergunta ${qid}`,
          required: false,
          order: i,
          options: [
            { id: `${formId}-${qid}-a`, label: "Sim", order: 0 },
            { id: `${formId}-${qid}-b`, label: "Não", order: 1 },
          ],
        })),
      },
    ],
  };
}

after(async () => {
  await prisma.form.deleteMany({ where: { id: { in: created } } });
  await prisma.user.deleteMany({ where: { username: { contains: MARK } } });
  await prisma.$disconnect();
});

// ─── O teste que motivou a reescrita ───────────────────────────────────────

test("editar formulário respondido PRESERVA as respostas das perguntas mantidas", async () => {
  const formId = await makeForm("preserva");
  const userId = await makeUser("respondente");

  await saveFormFor(ADMIN, { formId, draft: draftOf(formId, ["q1", "q2", "q3"]) });
  assert.equal(
    (await publishFormFor(ADMIN, {
      formId,
      userIds: [userId],
      sectorIds: [],
      anonymous: false,
    })).ok,
    true,
  );

  const toFill = await assignedFormFor(userId, formId);
  assert.ok(toFill, "o destinatário deve enxergar o formulário");
  const sent = await submitResponseFor(userId, {
    formId,
    answers: toFill.sections[0]!.questions.map((q) => ({
      questionId: q.id,
      optionIds: [q.options[0]!.id],
    })),
  });
  assert.equal(sent.ok, true, sent.error);
  assert.equal(await prisma.formAnswer.count({ where: { question: { section: { formId } } } }), 3);

  // Apaga a q3. As respostas de q1 e q2 têm de sobreviver — antes da reescrita,
  // o deleteMany levava as três.
  const shrunk = draftOf(formId, ["q1", "q2"]);
  const refused = await saveFormFor(ADMIN, { formId, draft: shrunk });
  assert.equal(refused.ok, false, "sem confirmar, não pode gravar");
  assert.equal(refused.removals?.length, 1);
  assert.equal(refused.removals?.[0]?.kind, "pergunta");
  assert.equal(refused.removals?.[0]?.affected, 1);
  assert.equal(
    await prisma.formAnswer.count({ where: { question: { section: { formId } } } }),
    3,
    "recusar não pode ter gravado nada",
  );

  const saved = await saveFormFor(ADMIN, { formId, draft: shrunk, confirmRemovals: true });
  assert.equal(saved.ok, true, saved.error);

  const left = await prisma.formAnswer.findMany({
    where: { question: { section: { formId } } },
    select: { questionId: true },
  });
  assert.equal(left.length, 2, "as duas perguntas mantidas conservam suas respostas");
  assert.deepEqual(
    left.map((a) => a.questionId).sort(),
    [`${formId}-q1`, `${formId}-q2`].sort(),
  );
  assert.equal(
    await prisma.formResponse.count({ where: { formId } }),
    1,
    "a resposta em si continua de pé",
  );
});

test("renomear pergunta respondida não perde nada e não pede confirmação", async () => {
  const formId = await makeForm("renomeia");
  const userId = await makeUser("respondente");

  await saveFormFor(ADMIN, { formId, draft: draftOf(formId, ["q1"]) });
  await publishFormFor(ADMIN, { formId, userIds: [userId], sectorIds: [], anonymous: false });
  const toFill = await assignedFormFor(userId, formId);
  await submitResponseFor(userId, {
    formId,
    answers: [
      {
        questionId: toFill!.sections[0]!.questions[0]!.id,
        optionIds: [toFill!.sections[0]!.questions[0]!.options[0]!.id],
      },
    ],
  });

  const renamed = draftOf(formId, ["q1"]);
  renamed.sections[0]!.questions[0]!.label = "Enunciado novo";
  const saved = await saveFormFor(ADMIN, { formId, draft: renamed });
  assert.equal(saved.ok, true, "renomear não destrói nada, então não pergunta");

  assert.equal(await prisma.formAnswer.count({ where: { question: { section: { formId } } } }), 1);
  const q = await prisma.formQuestion.findFirst({
    where: { section: { formId } },
    select: { label: true },
  });
  assert.equal(q?.label, "Enunciado novo");
});

test("acrescentar pergunta a formulário respondido não mexe no que existe", async () => {
  const formId = await makeForm("acrescenta");
  const userId = await makeUser("respondente");

  await saveFormFor(ADMIN, { formId, draft: draftOf(formId, ["q1"]) });
  await publishFormFor(ADMIN, { formId, userIds: [userId], sectorIds: [], anonymous: false });
  const toFill = await assignedFormFor(userId, formId);
  await submitResponseFor(userId, {
    formId,
    answers: [
      {
        questionId: toFill!.sections[0]!.questions[0]!.id,
        optionIds: [toFill!.sections[0]!.questions[0]!.options[0]!.id],
      },
    ],
  });

  const grown = await saveFormFor(ADMIN, { formId, draft: draftOf(formId, ["q1", "q2"]) });
  assert.equal(grown.ok, true, grown.error);
  assert.equal(await prisma.formQuestion.count({ where: { section: { formId } } }), 2);
  assert.equal(await prisma.formAnswer.count({ where: { question: { section: { formId } } } }), 1);
});

// ─── Reabrir ───────────────────────────────────────────────────────────────

test("reabrir cria rodada nova sem apagar a anterior", async () => {
  const formId = await makeForm("reabre");
  const userId = await makeUser("respondente");

  await saveFormFor(ADMIN, { formId, draft: draftOf(formId, ["q1"]) });
  await publishFormFor(ADMIN, { formId, userIds: [userId], sectorIds: [], anonymous: false });

  const first = await assignedFormFor(userId, formId);
  await submitResponseFor(userId, {
    formId,
    answers: [
      {
        questionId: first!.sections[0]!.questions[0]!.id,
        optionIds: [first!.sections[0]!.questions[0]!.options[0]!.id],
      },
    ],
  });

  // Respondeu: a pendência sai.
  assert.equal(await assignedFormFor(userId, formId), null);

  await closeFormFor(ADMIN, formId);
  const reopened = await reopenFormFor(ADMIN, formId);
  assert.equal(reopened.ok, true, reopened.error);

  const form = await prisma.form.findUnique({
    where: { id: formId },
    select: { status: true, currentRound: true, closedAt: true },
  });
  assert.equal(form?.status, "PUBLICADO");
  assert.equal(form?.currentRound, 2);
  assert.equal(form?.closedAt, null);

  // Quem já havia respondido volta a poder responder — é coleta nova.
  const second = await assignedFormFor(userId, formId);
  assert.ok(second, "a pendência volta na rodada nova");
  assert.equal(second.currentRound, 2);
  await submitResponseFor(userId, {
    formId,
    answers: [
      {
        questionId: second.sections[0]!.questions[0]!.id,
        optionIds: [second.sections[0]!.questions[0]!.options[1]!.id],
      },
    ],
  });

  assert.equal(await prisma.formResponse.count({ where: { formId, round: 1 } }), 1);
  assert.equal(await prisma.formResponse.count({ where: { formId, round: 2 } }), 1);

  // E o dashboard separa as duas.
  const atual = await formResultsInScope(null, formId);
  assert.equal(atual?.round, 2);
  assert.equal(atual?.responseCount, 1);
  assert.deepEqual(atual?.rounds, [1, 2]);

  const antiga = await formResultsInScope(null, formId, 1);
  assert.equal(antiga?.responseCount, 1);
  assert.equal(antiga?.results[0]?.options?.[0]?.count, 1, "rodada 1 marcou a primeira opção");
  assert.equal(antiga?.results[0]?.options?.[1]?.count, 0);
});

test("não se reabre o que não está encerrado", async () => {
  const formId = await makeForm("reabre-cedo");
  const refused = await reopenFormFor(ADMIN, formId);
  assert.equal(refused.ok, false);
  assert.match(refused.error ?? "", /encerrado/i);
});

// ─── Excluir ───────────────────────────────────────────────────────────────

test("excluir formulário com respostas exige a palavra digitada", async () => {
  const formId = await makeForm("exclui");
  const userId = await makeUser("respondente");

  await saveFormFor(ADMIN, { formId, draft: draftOf(formId, ["q1"]) });
  await publishFormFor(ADMIN, { formId, userIds: [userId], sectorIds: [], anonymous: false });
  const toFill = await assignedFormFor(userId, formId);
  await submitResponseFor(userId, {
    formId,
    answers: [
      {
        questionId: toFill!.sections[0]!.questions[0]!.id,
        optionIds: [toFill!.sections[0]!.questions[0]!.options[0]!.id],
      },
    ],
  });

  const refused = await deleteFormFor(ADMIN, { formId });
  assert.equal(refused.ok, false);
  assert.equal(refused.responseCount, 1);
  assert.ok(await prisma.form.findUnique({ where: { id: formId } }), "nada foi apagado");

  const wrong = await deleteFormFor(ADMIN, { formId, confirmation: "apagar" });
  assert.equal(wrong.ok, false, "a confirmação é sensível a maiúsculas");

  const done = await deleteFormFor(ADMIN, { formId, confirmation: DELETE_CONFIRMATION });
  assert.equal(done.ok, true, done.error);

  // O cascade leva tudo.
  assert.equal(await prisma.form.count({ where: { id: formId } }), 0);
  assert.equal(await prisma.formResponse.count({ where: { formId } }), 0);
  assert.equal(await prisma.formAssignment.count({ where: { formId } }), 0);
  assert.equal(await prisma.formQuestion.count({ where: { section: { formId } } }), 0);
});

test("excluir formulário vazio não pede confirmação", async () => {
  const formId = await makeForm("exclui-vazio");
  const done = await deleteFormFor(ADMIN, { formId });
  assert.equal(done.ok, true, done.error);
  assert.equal(await prisma.form.count({ where: { id: formId } }), 0);
});

// ─── Envio duplo ───────────────────────────────────────────────────────────

test("dois envios simultâneos gravam uma resposta só", async () => {
  const formId = await makeForm("duplo");
  const userId = await makeUser("respondente");

  await saveFormFor(ADMIN, { formId, draft: draftOf(formId, ["q1"]) });
  await publishFormFor(ADMIN, { formId, userIds: [userId], sectorIds: [], anonymous: false });
  const toFill = await assignedFormFor(userId, formId);
  const payload = {
    formId,
    answers: [
      {
        questionId: toFill!.sections[0]!.questions[0]!.id,
        optionIds: [toFill!.sections[0]!.questions[0]!.options[0]!.id],
      },
    ],
  };

  const [a, b] = await Promise.all([
    submitResponseFor(userId, payload),
    submitResponseFor(userId, payload),
  ]);
  assert.equal([a.ok, b.ok].filter(Boolean).length, 1, "exatamente um envio pode vencer");
  assert.equal(await prisma.formResponse.count({ where: { formId } }), 1);
});

// ─── Recorte por setor ─────────────────────────────────────────────────────

test("gestor de outro setor não alcança o formulário", async () => {
  const formId = await makeForm("escopo");
  const sector = await prisma.sector.findFirst({ select: { id: true } });
  assert.ok(sector, "o seed precisa ter criado setores");

  const outsider: FormActor = { id: "x", role: "GESTOR", sectorId: sector.id };
  const refused = await saveFormFor(outsider, { formId, draft: draftOf(formId, ["q1"]) });
  assert.equal(refused.ok, false);
  assert.match(refused.error ?? "", /não encontrado/i);

  const cantDelete = await deleteFormFor(outsider, { formId });
  assert.equal(cantDelete.ok, false);
  assert.ok(await prisma.form.findUnique({ where: { id: formId } }), "continua de pé");
});
