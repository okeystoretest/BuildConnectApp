import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { prisma } from "@/lib/db/prisma";
import { getActivityPage } from "./activity-timeline-data";

/**
 * As nove origens contra o Postgres: cada uma tem de virar o evento certo,
 * com a data certa, e nenhuma pode virar um evento que não é o seu.
 *
 * O caso que mais importa está no primeiro teste: `ContentProgress` serve
 * vídeo E documento, e `endedAt` é nulo nos documentos por definição do
 * schema. Sem o filtro certo, documento lido viraria "vídeo assistido".
 */

const MARK = "#ACTTL";
const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

let sectorId = "";
let subsectorId = "";
let typeId = "";
let sectionId = "";
let userId = "";
let outroId = "";

before(async () => {
  const s = await prisma.sector.create({
    data: { slug: `acttl-${stamp()}`, label: `Setor ${MARK}`, icon: "Box", order: 999 },
    select: { id: true },
  });
  sectorId = s.id;

  const sub = await prisma.subsector.create({
    data: {
      slug: `acttlsub-${stamp()}`,
      label: `Sub ${MARK}`,
      icon: "Box",
      kind: "PADRAO",
      order: 1,
      sectorId,
    },
    select: { id: true },
  });
  subsectorId = sub.id;

  const video = await prisma.video.create({
    data: {
      title: `Vídeo ${MARK}`,
      kind: "INSTRUCAO",
      subsectorId,
      filePath: "/uploads/acttl.mp4",
    },
    select: { id: true },
  });
  const videoId = video.id;

  const doc = await prisma.document.create({
    data: {
      name: `Manual ${MARK}`,
      kind: "PDF",
      sizeBytes: 10,
      filePath: "/uploads/acttl.pdf",
      subsectorId,
    },
    select: { id: true },
  });
  const documentId = doc.id;

  const u = await prisma.user.create({
    data: {
      username: `acttl-${stamp()}${MARK}`,
      fullName: `Ativo ${MARK}`,
      passwordHash: "x",
      role: "COLABORADOR",
      sectorId,
    },
    select: { id: true },
  });
  userId = u.id;

  const o = await prisma.user.create({
    data: {
      username: `acttlo-${stamp()}${MARK}`,
      fullName: `Outro ${MARK}`,
      passwordHash: "x",
      role: "GESTOR",
      sectorId,
    },
    select: { id: true },
  });
  outroId = o.id;

  // LOGIN gravado.
  await prisma.activityEvent.create({ data: { userId, kind: "LOGIN" } });

  // Vídeo assistido: endedAt preenchido.
  await prisma.contentProgress.create({
    data: { userId, videoId, completed: true, endedAt: new Date() },
  });
  // Documento lido: endedAt NULO, por definição do schema.
  await prisma.contentProgress.create({
    data: { userId, documentId, completed: true, endedAt: null },
  });

  await prisma.videoComprehension.create({
    data: { userId, videoId, answer: "resposta", attempt: 1 },
  });
  await prisma.videoRating.create({
    data: { userId, videoId, audio: 5, image: 4, clarity: 5 },
  });

  const type = await prisma.evaluationType.create({
    data: {
      slug: `acttl-${stamp()}`,
      kind: "EFICACIA",
      title: `Eficácia ${MARK}`,
      scaleMax: 5,
      order: 999,
    },
    select: { id: true },
  });
  typeId = type.id;

  const section = await prisma.evaluationSection.create({
    data: { typeId, title: `Seção ${MARK}`, order: 1 },
    select: { id: true },
  });
  sectionId = section.id;

  // Rodada aberta SOBRE o usuário.
  await prisma.evaluationRound.create({ data: { typeId, subjectId: userId } });

  // O usuário designado PARA AVALIAR outra pessoa.
  const outraRodada = await prisma.evaluationRound.create({
    data: { typeId, subjectId: outroId },
    select: { id: true },
  });
  await prisma.evaluationAssignment.create({
    data: { roundId: outraRodada.id, raterId: userId },
  });

  // O usuário respondeu uma avaliação sobre o outro.
  await prisma.evaluation.create({
    data: {
      typeId,
      subjectId: outroId,
      evaluatorId: userId,
      roundId: outraRodada.id,
      status: "CONCLUIDA",
      total: 7,
    },
  });

  // Chamado aberto por ele.
  await prisma.ticket.create({
    data: {
      code: `T-${stamp()}`,
      destination: "TI",
      title: `Chamado ${MARK}`,
      requesterId: userId,
    },
  });
});

after(async () => {
  const ids = [userId, outroId];
  await prisma.ticket.deleteMany({ where: { requesterId: { in: ids } } });
  await prisma.evaluation.deleteMany({ where: { typeId } });
  await prisma.evaluationAssignment.deleteMany({ where: { raterId: { in: ids } } });
  await prisma.evaluationRound.deleteMany({ where: { typeId } });
  await prisma.evaluationSection.deleteMany({ where: { id: sectionId } });
  await prisma.evaluationType.deleteMany({ where: { id: typeId } });
  await prisma.videoRating.deleteMany({ where: { userId: { in: ids } } });
  await prisma.videoComprehension.deleteMany({ where: { userId: { in: ids } } });
  await prisma.contentProgress.deleteMany({ where: { userId: { in: ids } } });
  await prisma.activityEvent.deleteMany({ where: { userId: { in: ids } } });
  await prisma.document.deleteMany({ where: { subsectorId } });
  await prisma.video.deleteMany({ where: { subsectorId } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.subsector.deleteMany({ where: { id: subsectorId } });
  await prisma.sector.deleteMany({ where: { id: sectorId } });
  await prisma.$disconnect();
});

test("documento lido NÃO vira vídeo assistido", async () => {
  const { events } = await getActivityPage({ userId });
  const assistidos = events.filter((e) => e.kind === "VIDEO_ASSISTIDO");
  assert.equal(assistidos.length, 1);
  assert.ok(assistidos[0]?.detail?.includes("Vídeo"));
  assert.ok(!assistidos.some((e) => e.detail?.includes("Manual")));
});

test("as nove origens aparecem, cada uma no seu tipo", async () => {
  const { events } = await getActivityPage({ userId });
  const kinds = new Set<string>(events.map((e) => e.kind));
  for (const esperado of [
    "CADASTRO",
    "LOGIN",
    "VIDEO_ASSISTIDO",
    "RESPOSTA_COMPREENSAO",
    "AVALIACAO_VIDEO",
    "AVALIACAO_DESIGNADA",
    "AVALIACAO_ABERTA",
    "AVALIACAO_RESPONDIDA",
    "CHAMADO_ABERTO",
  ]) {
    assert.ok(kinds.has(esperado), `faltou ${esperado}`);
  }
});

test("o cadastro é sempre o evento mais antigo", async () => {
  const { events } = await getActivityPage({ userId });
  assert.equal(events[events.length - 1]?.kind, "CADASTRO");
});

test("os eventos vêm do mais recente para o mais antigo", async () => {
  const { events } = await getActivityPage({ userId });
  for (let i = 1; i < events.length; i += 1) {
    const anterior = events[i - 1];
    const atual = events[i];
    assert.ok(anterior && atual);
    assert.ok(
      anterior.occurredAt.getTime() >= atual.occurredAt.getTime(),
      `evento ${i} está fora de ordem`,
    );
  }
});

test("a atividade de uma pessoa não vaza para a de outra", async () => {
  const { events } = await getActivityPage({ userId: outroId });
  assert.ok(!events.some((e) => e.kind === "LOGIN"));
  assert.ok(!events.some((e) => e.kind === "CHAMADO_ABERTO"));
  assert.ok(!events.some((e) => e.kind === "VIDEO_ASSISTIDO"));
});

test("chamado leva o código no título e o assunto no detalhe", async () => {
  const { events } = await getActivityPage({ userId });
  const chamado = events.find((e) => e.kind === "CHAMADO_ABERTO");
  assert.ok(chamado?.title.startsWith("Abriu chamado"));
  assert.ok(chamado?.detail?.includes("Chamado"));
});

test("designado para avaliar e avaliação aberta sobre ele são eventos distintos", async () => {
  const { events } = await getActivityPage({ userId });
  const designada = events.find((e) => e.kind === "AVALIACAO_DESIGNADA");
  const aberta = events.find((e) => e.kind === "AVALIACAO_ABERTA");
  assert.ok(designada && aberta);
  assert.notEqual(designada.id, aberta.id);
  // Quem ele avalia vai no detalhe da designação.
  assert.ok(designada.detail?.includes("Outro"));
});

test("usuário inexistente devolve linha do tempo vazia, não erro", async () => {
  const out = await getActivityPage({ userId: "nao-existe-este-id" });
  assert.deepEqual(out.events, []);
  assert.equal(out.nextCursor, null);
});

test("avaliador zerado tira a avaliação da linha do tempo dele", async () => {
  // É o que `onDelete: SetNull` faz ao excluir o avaliador: a avaliação
  // continua valendo, sem o nome — e deixa de ser ação de alguém.
  await prisma.evaluation.updateMany({ where: { typeId }, data: { evaluatorId: null } });
  const { events } = await getActivityPage({ userId });
  assert.ok(!events.some((e) => e.kind === "AVALIACAO_RESPONDIDA"));
});
