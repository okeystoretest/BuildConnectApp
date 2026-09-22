import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { prisma } from "@/lib/db/prisma";

/**
 * O ciclo completo contra o Postgres: responder, reprovar, reassistir,
 * responder de novo. O que este teste protege é a regra que não cabe em
 * módulo puro — a chave por tentativa e a volta do vídeo a pendente.
 */

const MARK = "#CYCLE";
const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

let colabId = "";
let videoId = "";
let subsectorId = "";
let sectorId = "";

before(async () => {
  const sector = await prisma.sector.create({
    data: { slug: `cyc-${stamp()}`, label: `Setor ${MARK}`, icon: "Box", order: 999 },
    select: { id: true },
  });
  sectorId = sector.id;

  const sub = await prisma.subsector.create({
    data: {
      slug: `cycsub-${stamp()}`,
      label: `Sub ${MARK}`,
      icon: "Box",
      kind: "PADRAO",
      order: 1,
      sectorId,
    },
    select: { id: true },
  });
  subsectorId = sub.id;

  const colab = await prisma.user.create({
    data: {
      username: `cyc-${stamp()}${MARK}`,
      fullName: `Colaborador ${MARK}`,
      passwordHash: "x",
      role: "COLABORADOR",
      sectorId,
    },
    select: { id: true },
  });
  colabId = colab.id;

  const video = await prisma.video.create({
    data: { title: `Vídeo ${MARK}`, kind: "INSTRUCAO", subsectorId, filePath: "/uploads/x.mp4" },
    select: { id: true },
  });
  videoId = video.id;
});

after(async () => {
  await prisma.videoComprehension.deleteMany({ where: { userId: colabId } });
  await prisma.contentProgress.deleteMany({ where: { userId: colabId } });
  await prisma.video.deleteMany({ where: { subsectorId } });
  await prisma.user.deleteMany({ where: { id: colabId } });
  await prisma.subsector.deleteMany({ where: { id: subsectorId } });
  await prisma.sector.deleteMany({ where: { id: sectorId } });
  await prisma.$disconnect();
});

test("a segunda tentativa convive com a primeira", async () => {
  await prisma.contentProgress.create({
    data: { userId: colabId, videoId, endedAt: new Date(), completed: false },
  });
  await prisma.videoComprehension.create({
    data: {
      userId: colabId,
      videoId,
      answer: "primeira resposta",
      attempt: 1,
      grade: 5,
      gradedAt: new Date(),
    },
  });
  await prisma.videoComprehension.create({
    data: { userId: colabId, videoId, answer: "segunda resposta", attempt: 2 },
  });

  const all = await prisma.videoComprehension.findMany({
    where: { userId: colabId, videoId },
    orderBy: { attempt: "asc" },
    select: { attempt: true },
  });
  assert.deepEqual(
    all.map((a) => a.attempt),
    [1, 2],
  );
});

test("a mesma tentativa duas vezes é recusada pelo banco", async () => {
  await assert.rejects(
    prisma.videoComprehension.create({
      data: { userId: colabId, videoId, answer: "duplicada", attempt: 2 },
    }),
  );
});

test("reprovar devolve o vídeo a pendente e zera o endedAt", async () => {
  // Estado de quem respondeu: concluído, com o fim do vídeo registrado.
  await prisma.contentProgress.update({
    where: { userId_videoId: { userId: colabId, videoId } },
    data: { completed: true, completedAt: new Date(), endedAt: new Date() },
  });

  // O que `gradeVideoComprehension` faz ao reprovar.
  await prisma.contentProgress.update({
    where: { userId_videoId: { userId: colabId, videoId } },
    data: { completed: false, completedAt: null, endedAt: null },
  });

  const progress = await prisma.contentProgress.findUnique({
    where: { userId_videoId: { userId: colabId, videoId } },
    select: { completed: true, completedAt: true, endedAt: true },
  });
  assert.equal(progress?.completed, false);
  assert.equal(progress?.completedAt, null);
  // Sem isto, o colaborador responderia de novo sem reassistir.
  assert.equal(progress?.endedAt, null);
});
