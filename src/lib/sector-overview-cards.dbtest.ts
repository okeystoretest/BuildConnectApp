import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { prisma } from "@/lib/db/prisma";
import { getSectorOverview } from "./sector-overview-data";
import { groupPending } from "./sector-overview";

/**
 * O que os DOIS BOTÕES do card do colaborador abrem, contra o Postgres.
 *
 * Antes o card só sabia CONTAR pendências (`total − concluídos`) e listava as
 * notas de compreensão num acordeão. Agora cada botão abre um modal, e modal
 * exige lista, não contagem — este teste existe para travar as três coisas que
 * a mudança pode quebrar em silêncio:
 *
 *  1. o número do botão e o conteúdo do modal saem da MESMA lista (antes eram
 *     duas contas independentes, livres para divergir);
 *  2. a lista traz o que a pessoa realmente não concluiu, por mídia;
 *  3. as avaliações de desempenho chegam ao card com o teto de pontos do
 *     formulário — `total` sem `maxTotal` é um número sem escala.
 */

const MARK = "#CARDS";
const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

let sectorId = "";
let subsectorId = "";
let videoId = "";
let documentId = "";
let typeId = "";
let sectionId = "";
let emDiaId = "";
let atrasadoId = "";
let gestorId = "";
let evaluationId = "";

async function makeUser(name: string, role: "COLABORADOR" | "GESTOR"): Promise<string> {
  const u = await prisma.user.create({
    data: {
      username: `cards-${stamp()}${MARK}`,
      fullName: `${name} ${MARK}`,
      passwordHash: "x",
      role,
      sectorId,
    },
    select: { id: true },
  });
  return u.id;
}

before(async () => {
  const s = await prisma.sector.create({
    data: { slug: `cards-${stamp()}`, label: `Setor ${MARK}`, icon: "Box", order: 999 },
    select: { id: true },
  });
  sectorId = s.id;

  const sub = await prisma.subsector.create({
    data: {
      slug: `cardsub-${stamp()}`,
      label: `Sub ${MARK}`,
      icon: "Box",
      kind: "PADRAO",
      order: 1,
      sectorId,
    },
    select: { id: true },
  });
  subsectorId = sub.id;

  // O setor tem exatamente dois itens: um vídeo e um documento.
  const video = await prisma.video.create({
    data: {
      title: `Vídeo ${MARK}`,
      kind: "INSTRUCAO",
      subsectorId,
      filePath: "/uploads/cards.mp4",
    },
    select: { id: true },
  });
  videoId = video.id;

  const doc = await prisma.document.create({
    data: {
      name: `Manual ${MARK}`,
      kind: "PDF",
      sizeBytes: 1024,
      filePath: "/uploads/cards.pdf",
      subsectorId,
    },
    select: { id: true },
  });
  documentId = doc.id;

  gestorId = await makeUser("Gestor", "GESTOR");
  emDiaId = await makeUser("EmDia", "COLABORADOR");
  atrasadoId = await makeUser("Atrasado", "COLABORADOR");

  // EmDia concluiu o vídeo e falta só o documento.
  await prisma.contentProgress.create({
    data: { userId: emDiaId, videoId, completed: true, endedAt: new Date() },
  });
  // Atrasado não concluiu nada: deve os dois.

  /*
   * Formulário de desempenho com 2 questões numa escala de 5 → teto 10. É o
   * cálculo do `maxTotal`, e ele mora numa consulta separada da avaliação.
   */
  const type = await prisma.evaluationType.create({
    data: {
      slug: `cards-${stamp()}`,
      kind: "COMPORTAMENTAL",
      title: `Comportamental ${MARK}`,
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

  await prisma.evaluationQuestion.createMany({
    data: [
      { sectionId, label: `Critério A ${MARK}`, order: 1 },
      { sectionId, label: `Critério B ${MARK}`, order: 2 },
    ],
  });

  const evaluation = await prisma.evaluation.create({
    data: {
      typeId,
      subjectId: emDiaId,
      evaluatorId: gestorId,
      status: "CONCLUIDA",
      total: 8,
    },
    select: { id: true },
  });
  evaluationId = evaluation.id;

  // Rascunho do MESMO colaborador: não é histórico, não pode aparecer.
  await prisma.evaluation.create({
    data: { typeId, subjectId: emDiaId, evaluatorId: gestorId, status: "RASCUNHO", total: 2 },
  });
});

after(async () => {
  const ids = [emDiaId, atrasadoId, gestorId];
  await prisma.evaluation.deleteMany({ where: { subjectId: { in: ids } } });
  await prisma.evaluationQuestion.deleteMany({ where: { sectionId } });
  await prisma.evaluationSection.deleteMany({ where: { typeId } });
  await prisma.evaluationType.deleteMany({ where: { id: typeId } });
  await prisma.contentProgress.deleteMany({ where: { userId: { in: ids } } });
  await prisma.video.deleteMany({ where: { subsectorId } });
  await prisma.document.deleteMany({ where: { subsectorId } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.subsector.deleteMany({ where: { id: subsectorId } });
  await prisma.sector.deleteMany({ where: { id: sectorId } });
  await prisma.$disconnect();
});

test("o número do botão é o tamanho da lista que o modal abre", async () => {
  const out = await getSectorOverview({ sectorId });
  for (const member of out.members) {
    assert.equal(
      member.pending,
      member.pendingList.length,
      `${member.name}: o botão diz ${member.pending} e a lista tem ${member.pendingList.length}`,
    );
  }
});

test("a lista de pendências traz só o que a pessoa não concluiu", async () => {
  const out = await getSectorOverview({ sectorId });
  const emDia = out.members.find((m) => m.userId === emDiaId);
  const atrasado = out.members.find((m) => m.userId === atrasadoId);
  assert.ok(emDia && atrasado);

  // Concluiu o vídeo: sobra o documento, e só ele.
  assert.equal(emDia.pending, 1);
  assert.deepEqual(
    emDia.pendingList.map((i) => i.id),
    [documentId],
  );

  // Não concluiu nada: deve os dois itens do setor.
  assert.equal(atrasado.pending, 2);
  assert.deepEqual(
    [...atrasado.pendingList.map((i) => i.id)].sort(),
    [documentId, videoId].sort(),
  );
});

test("o modal agrupa as pendências por mídia, e some o grupo vazio", async () => {
  const out = await getSectorOverview({ sectorId });
  const emDia = out.members.find((m) => m.userId === emDiaId);
  const atrasado = out.members.find((m) => m.userId === atrasadoId);
  assert.ok(emDia && atrasado);

  // Só documento: o cabeçalho "Vídeos" não aparece.
  assert.deepEqual(
    groupPending(emDia.pendingList).map((g) => g.label),
    ["Documentos"],
  );
  assert.deepEqual(
    groupPending(atrasado.pendingList).map((g) => g.label),
    ["Vídeos", "Documentos"],
  );
});

test("as avaliações de desempenho chegam com o teto de pontos do formulário", async () => {
  const out = await getSectorOverview({ sectorId });
  const emDia = out.members.find((m) => m.userId === emDiaId);
  assert.ok(emDia);

  // Só a CONCLUIDA: o rascunho do mesmo colaborador fica de fora.
  assert.equal(emDia.performance.length, 1);
  const [entry] = emDia.performance;
  assert.ok(entry);
  assert.equal(entry.id, evaluationId);
  assert.equal(entry.total, 8);
  // 2 questões × escala 5.
  assert.equal(entry.maxTotal, 10);
  assert.equal(entry.selfAssessment, false);
  assert.ok(entry.evaluatorName.includes("Gestor"));
});

test("quem não foi avaliado tem a lista de desempenho vazia, não nula", async () => {
  const out = await getSectorOverview({ sectorId });
  const atrasado = out.members.find((m) => m.userId === atrasadoId);
  assert.deepEqual(atrasado?.performance, []);
});
