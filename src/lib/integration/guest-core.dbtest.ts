import assert from "node:assert/strict";
import test, { after } from "node:test";
import { prisma } from "@/lib/db/prisma";
import { concludeFilmFor, submitQuizFor } from "./guest-core";
import { getTrail } from "./data";
import { ACCESS_WINDOW_MS, accessClosed } from "./access";

/**
 * Testes contra um Postgres DE VERDADE.
 *
 * Rodam com `npm run test:db`, e não com `npm test`, de propósito: `npm test`
 * precisa continuar funcionando em máquina sem banco.
 *
 * `grade.test.ts` já prova a CONTA da nota; `trail.test.ts`, a do
 * destravamento. O que falta provar é que o servidor as APLICA — que
 * reprovado não conclui, que a cobrança por WhatsApp entra na fila, que o
 * convite se fecha sozinho no fim, e que nada disso depende do que a tela
 * mandou.
 *
 * A trilha é GLOBAL e o banco já tem os filmes reais, então os de teste
 * nascem no fim da ordem (900+) e `primeTrail` dá por aprovado tudo que vem
 * antes — senão o filme sob teste nasceria trancado atrás do acervo de
 * verdade, e o teste falharia por motivo nenhum.
 */

const MARK = "#DBTEST-INTEGRACAO";
const BASE_ORDER = 900;
const guests: string[] = [];
const assets: string[] = [];

async function makeGuest(name: string, phone: string | null = "11999990000"): Promise<string> {
  const guest = await prisma.integrationGuest.create({
    data: {
      token: `tk-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      fullName: `${name} (teste)${MARK}`,
      phone,
    },
    select: { id: true },
  });
  guests.push(guest.id);
  return guest.id;
}

interface TestFilm {
  assetId: string;
  order: number;
  /** [questionId, idDaCorreta, idDeUmaErrada][] */
  questions: [string, string, string][];
}

/** Filme com `questionCount` perguntas de 3 alternativas, a 2ª correta. */
async function makeFilm(order: number, questionCount: number): Promise<TestFilm> {
  const asset = await prisma.integrationAsset.create({
    data: { kind: "FILME", title: `Filme ${order}${MARK}`, order, filePath: "/uploads/x.mp4" },
    select: { id: true },
  });
  assets.push(asset.id);

  const questions: [string, string, string][] = [];
  for (let i = 0; i < questionCount; i += 1) {
    const q = await prisma.integrationQuestion.create({
      data: {
        assetId: asset.id,
        label: `Pergunta ${i + 1}`,
        order: i,
        options: {
          create: [
            { label: "A", order: 0, correct: false },
            { label: "B", order: 1, correct: true },
            { label: "C", order: 2, correct: false },
          ],
        },
      },
      select: { id: true, options: { orderBy: { order: "asc" }, select: { id: true, correct: true } } },
    });
    const certa = q.options.find((o) => o.correct)!.id;
    const errada = q.options.find((o) => !o.correct)!.id;
    questions.push([q.id, certa, errada]);
  }

  return { assetId: asset.id, order, questions };
}

/** Dá por aprovado tudo que vem ANTES, para o filme sob teste ficar liberado. */
async function primeTrail(guestId: string, order: number): Promise<void> {
  const earlier = await prisma.integrationAsset.findMany({
    where: { kind: "FILME", order: { lt: order } },
    select: { id: true },
  });
  for (const a of earlier) {
    await prisma.integrationAttempt.create({
      data: { guestId, assetId: a.id, correctCount: 1, totalCount: 1, passed: true },
    });
  }
}

/** Respostas com `acertos` corretas e o resto errado. */
function respostas(film: TestFilm, acertos: number): Map<string, string> {
  return new Map(film.questions.map(([qid, certa, errada], i) => [qid, i < acertos ? certa : errada]));
}

async function stateOf(guestId: string, assetId: string) {
  return (await getTrail(guestId)).find((f) => f.id === assetId)?.state;
}

async function clearFilms() {
  await prisma.integrationAsset.deleteMany({ where: { id: { in: assets } } });
  assets.length = 0;
}

after(async () => {
  await clearFilms();
  // Apagar o convidado leva tentativas, respostas e mensagens (cascade).
  await prisma.integrationGuest.deleteMany({ where: { id: { in: guests } } });
  await prisma.$disconnect();
});

// ─── A nota, aplicada ──────────────────────────────────────────────────────

test("5 de 5 aprova, conclui o filme e destrava o próximo", async () => {
  const guest = await makeGuest("aplicado");
  const f1 = await makeFilm(BASE_ORDER, 5);
  const f2 = await makeFilm(BASE_ORDER + 1, 5);
  await primeTrail(guest, f1.order);

  const res = await submitQuizFor(guest, f1.assetId, respostas(f1, 5));

  assert.equal(res.passed, true, res.error);
  assert.equal(res.correctCount, 5);
  assert.equal(await stateOf(guest, f1.assetId), "CONCLUIDO");
  assert.equal(await stateOf(guest, f2.assetId), "LIBERADO");

  await clearFilms();
});

test("4 de 5 (nota 8) ainda aprova — errar uma não reprova", async () => {
  const guest = await makeGuest("quase");
  const f1 = await makeFilm(BASE_ORDER, 5);
  await makeFilm(BASE_ORDER + 1, 5);
  await primeTrail(guest, f1.order);

  const res = await submitQuizFor(guest, f1.assetId, respostas(f1, 4));

  assert.equal(res.passed, true, res.error);
  assert.equal(await stateOf(guest, f1.assetId), "CONCLUIDO");

  await clearFilms();
});

/**
 * O caso que o escopo nomeia: duas erradas. Com 5 perguntas a nota cai a 6,0,
 * abaixo do piso de 7 — reprova, o filme NÃO conclui e a cobrança vai para a
 * fila do WhatsApp.
 */
test("3 de 5 (nota 6) reprova, não conclui e enfileira a cobrança", async () => {
  const guest = await makeGuest("apressado");
  const f1 = await makeFilm(BASE_ORDER, 5);
  const f2 = await makeFilm(BASE_ORDER + 1, 5);
  await primeTrail(guest, f1.order);

  const res = await submitQuizFor(guest, f1.assetId, respostas(f1, 3));

  assert.equal(res.passed, false);
  assert.equal(res.correctCount, 3);
  assert.equal(await stateOf(guest, f1.assetId), "LIBERADO", "reprovado não pode concluir");
  assert.equal(await stateOf(guest, f2.assetId), "TRANCADO", "nem destravar o seguinte");

  const fila = await prisma.whatsappMessage.findMany({
    where: { guestId: guest },
    select: { kind: true, text: true },
  });
  assert.equal(fila.length, 1, "a cobrança tem de estar na fila");
  assert.equal(fila[0]?.kind, "INTEGRACAO");
  assert.match(fila[0]?.text ?? "", /assista ao filme e responda novamente/i);

  await clearFilms();
});

test("a tentativa reprovada fica gravada, com as respostas", async () => {
  const guest = await makeGuest("registrado");
  const f1 = await makeFilm(BASE_ORDER, 5);
  await primeTrail(guest, f1.order);

  await submitQuizFor(guest, f1.assetId, respostas(f1, 2));

  const attempt = await prisma.integrationAttempt.findFirst({
    where: { guestId: guest, assetId: f1.assetId },
    select: { correctCount: true, totalCount: true, passed: true, _count: { select: { answers: true } } },
  });
  assert.deepEqual(
    { c: attempt?.correctCount, t: attempt?.totalCount, p: attempt?.passed, a: attempt?._count.answers },
    { c: 2, t: 5, p: false, a: 5 },
  );

  await clearFilms();
});

test("depois de reprovar, refazer e acertar conclui", async () => {
  const guest = await makeGuest("persistente");
  const f1 = await makeFilm(BASE_ORDER, 5);
  await makeFilm(BASE_ORDER + 1, 5);
  await primeTrail(guest, f1.order);

  await submitQuizFor(guest, f1.assetId, respostas(f1, 1));
  const segunda = await submitQuizFor(guest, f1.assetId, respostas(f1, 5));

  assert.equal(segunda.passed, true, segunda.error);
  assert.equal(await stateOf(guest, f1.assetId), "CONCLUIDO");
  assert.equal(
    await prisma.integrationAttempt.count({ where: { guestId: guest, assetId: f1.assetId } }),
    2,
    "as duas rodadas ficam no histórico",
  );

  await clearFilms();
});

test("convite sem telefone não enfileira cobrança nem falha o envio", async () => {
  const guest = await makeGuest("sem-numero", null);
  const f1 = await makeFilm(BASE_ORDER, 5);
  await primeTrail(guest, f1.order);

  const res = await submitQuizFor(guest, f1.assetId, respostas(f1, 0));

  assert.equal(res.passed, false);
  assert.equal(await prisma.whatsappMessage.count({ where: { guestId: guest } }), 0);

  await clearFilms();
});

// ─── Trilha e fechamento automático ────────────────────────────────────────

test("pedir um filme trancado não grava tentativa nenhuma", async () => {
  const guest = await makeGuest("pulador");
  const f1 = await makeFilm(BASE_ORDER, 5);
  const f2 = await makeFilm(BASE_ORDER + 1, 5);
  await primeTrail(guest, f1.order);

  const res = await submitQuizFor(guest, f2.assetId, respostas(f2, 5));

  assert.equal(res.ok, false);
  assert.match(res.error ?? "", /anteriores/i);
  assert.equal(
    await prisma.integrationAttempt.count({ where: { guestId: guest, assetId: f2.assetId } }),
    0,
  );

  await clearFilms();
});

test("marcar a opção de outra pergunta não vira acerto", async () => {
  const guest = await makeGuest("forjador");
  const f1 = await makeFilm(BASE_ORDER, 5);
  await primeTrail(guest, f1.order);

  // Todas as perguntas recebem a alternativa correta DA PRIMEIRA.
  const forjado = new Map(f1.questions.map(([qid]) => [qid, f1.questions[0]![1]]));
  const res = await submitQuizFor(guest, f1.assetId, forjado);

  assert.equal(res.correctCount, 1, "só a primeira casa com a própria pergunta");
  assert.equal(res.passed, false);

  await clearFilms();
});

/**
 * Terminada a trilha, a conclusão fica GRAVADA e o acesso ganha prazo.
 *
 * Até 03/11/2026 isto escrevia `revokedAt` na hora, e o convidado recebia um
 * 404 no instante em que terminava o último filme. O que o teste protege
 * agora é o contrário: quem acabou de concluir CONTINUA entrando, por 24 h.
 */
test("concluir o último filme grava a conclusão e abre a janela de 24 h", async () => {
  const guest = await makeGuest("terminou");
  const todos = await prisma.integrationAsset.findMany({
    where: { kind: "FILME" },
    select: { id: true },
  });
  // Aprova todos menos um, que fica para o envio fechar.
  const f = await makeFilm(BASE_ORDER, 5);
  for (const a of todos) {
    await prisma.integrationAttempt.create({
      data: { guestId: guest, assetId: a.id, correctCount: 1, totalCount: 1, passed: true },
    });
  }

  const antes = await prisma.integrationGuest.findUnique({
    where: { id: guest },
    select: { completedAt: true, accessUntil: true, revokedAt: true },
  });
  assert.equal(antes?.completedAt, null, "antes do último, ninguém concluiu");
  assert.equal(accessClosed(antes!, new Date()), false, "e o convite segue aberto");

  const res = await submitQuizFor(guest, f.assetId, respostas(f, 5));

  assert.equal(res.passed, true, res.error);
  assert.equal(res.finished, true);

  const depois = await prisma.integrationGuest.findUnique({
    where: { id: guest },
    select: { completedAt: true, accessUntil: true, revokedAt: true },
  });
  assert.notEqual(depois?.completedAt, null, "a conclusão tem de ficar gravada");
  assert.equal(depois?.revokedAt, null, "concluir NÃO revoga");
  assert.equal(
    accessClosed(depois!, new Date()),
    false,
    "quem acabou de concluir ainda entra",
  );
  assert.equal(
    accessClosed(depois!, new Date(Date.now() + ACCESS_WINDOW_MS + 1000)),
    true,
    "e deixa de entrar quando a janela vence",
  );

  await clearFilms();
});

/**
 * O motivo de `completedAt` existir: refazer um filme já aprovado, ou o DHO
 * cadastrar um filme novo, não pode apagar o fato de a pessoa ter terminado
 * nem reiniciar o prazo dela.
 */
test("concluir duas vezes não reescreve a data nem renova a janela", async () => {
  const guest = await makeGuest("reincidente");
  const todos = await prisma.integrationAsset.findMany({
    where: { kind: "FILME" },
    select: { id: true },
  });
  const f = await makeFilm(BASE_ORDER, 5);
  for (const a of todos) {
    await prisma.integrationAttempt.create({
      data: { guestId: guest, assetId: a.id, correctCount: 1, totalCount: 1, passed: true },
    });
  }

  await submitQuizFor(guest, f.assetId, respostas(f, 5));
  const primeira = await prisma.integrationGuest.findUnique({
    where: { id: guest },
    select: { completedAt: true, accessUntil: true },
  });

  await submitQuizFor(guest, f.assetId, respostas(f, 5));
  const segunda = await prisma.integrationGuest.findUnique({
    where: { id: guest },
    select: { completedAt: true, accessUntil: true },
  });

  assert.deepEqual(segunda, primeira, "a segunda conclusão não mexe em nada");

  await clearFilms();
});

test("filme sem questionário conclui pelo fim do vídeo; com questionário, não", async () => {
  const guest = await makeGuest("sem-perguntas");
  const semQuiz = await makeFilm(BASE_ORDER, 0);
  const comQuiz = await makeFilm(BASE_ORDER + 1, 5);
  await primeTrail(guest, semQuiz.order);

  assert.equal((await concludeFilmFor(guest, semQuiz.assetId)).ok, true);
  assert.equal(await stateOf(guest, semQuiz.assetId), "CONCLUIDO");

  const recusa = await concludeFilmFor(guest, comQuiz.assetId);
  assert.equal(recusa.ok, false);
  assert.match(recusa.error ?? "", /question[áa]rio/i);

  await clearFilms();
});
