import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { prisma } from "@/lib/db/prisma";

/**
 * A avaliação contra o Postgres: uma linha por pessoa por vídeo, reavaliar
 * substitui, e excluir o vídeo leva a avaliação junto.
 */

const MARK = "#RATING";
const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

let userId = "";
let videoId = "";
let subsectorId = "";
let sectorId = "";

before(async () => {
  const sector = await prisma.sector.create({
    data: { slug: `rt-${stamp()}`, label: `Setor ${MARK}`, icon: "Box", order: 999 },
    select: { id: true },
  });
  sectorId = sector.id;

  const sub = await prisma.subsector.create({
    data: {
      slug: `rtsub-${stamp()}`,
      label: `Sub ${MARK}`,
      icon: "Box",
      kind: "PADRAO",
      order: 1,
      sectorId,
    },
    select: { id: true },
  });
  subsectorId = sub.id;

  const user = await prisma.user.create({
    data: {
      username: `rt-${stamp()}${MARK}`,
      fullName: `Pessoa ${MARK}`,
      passwordHash: "x",
      role: "COLABORADOR",
      sectorId,
    },
    select: { id: true },
  });
  userId = user.id;

  const video = await prisma.video.create({
    data: { title: `Vídeo ${MARK}`, kind: "INSTRUCAO", subsectorId, filePath: "/uploads/x.mp4" },
    select: { id: true },
  });
  videoId = video.id;
});

after(async () => {
  await prisma.videoRating.deleteMany({ where: { userId } });
  await prisma.video.deleteMany({ where: { subsectorId } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.subsector.deleteMany({ where: { id: subsectorId } });
  await prisma.sector.deleteMany({ where: { id: sectorId } });
  await prisma.$disconnect();
});

test("critério não avaliado fica nulo, não zero", async () => {
  await prisma.videoRating.create({
    data: { userId, videoId, audio: 4, image: null, clarity: null },
  });
  const row = await prisma.videoRating.findUnique({
    where: { userId_videoId: { userId, videoId } },
    select: { audio: true, image: true, clarity: true },
  });
  assert.equal(row?.audio, 4);
  assert.equal(row?.image, null);
  assert.equal(row?.clarity, null);
});

test("reavaliar substitui, sem criar segunda linha", async () => {
  await prisma.videoRating.upsert({
    where: { userId_videoId: { userId, videoId } },
    create: { userId, videoId, audio: 2, image: 2, clarity: 2 },
    update: { audio: 2, image: 2, clarity: 2, comment: "revisto" },
  });
  const rows = await prisma.videoRating.findMany({ where: { userId, videoId } });
  assert.equal(rows.length, 1);
  const [only] = rows;
  assert.equal(only?.audio, 2);
  assert.equal(only?.comment, "revisto");
});

test("excluir o vídeo leva a avaliação junto", async () => {
  const temp = await prisma.video.create({
    data: { title: `Temp ${MARK}`, kind: "INSTRUCAO", subsectorId },
    select: { id: true },
  });
  await prisma.videoRating.create({
    data: { userId, videoId: temp.id, audio: 5, image: null, clarity: null },
  });
  await prisma.video.delete({ where: { id: temp.id } });
  const left = await prisma.videoRating.count({ where: { videoId: temp.id } });
  assert.equal(left, 0);
});
