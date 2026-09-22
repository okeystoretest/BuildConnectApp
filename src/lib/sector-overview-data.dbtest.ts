import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { prisma } from "@/lib/db/prisma";
import { getSectorOverview } from "./sector-overview-data";

/**
 * O painel contra o Postgres: dois colaboradores do setor, um de fora, e as
 * notas dos dois lados da régua dos 7.
 */

const MARK = "#OVERVIEW";
const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

let sectorId = "";
let otherSectorId = "";
let subsectorId = "";
let aprovadoId = "";
let reprovadoId = "";
let forasteiroId = "";
let videoId = "";

async function makeUser(name: string, sector: string): Promise<string> {
  const u = await prisma.user.create({
    data: {
      username: `ov-${stamp()}${MARK}`,
      fullName: `${name} ${MARK}`,
      passwordHash: "x",
      role: "COLABORADOR",
      sectorId: sector,
    },
    select: { id: true },
  });
  return u.id;
}

before(async () => {
  const s = await prisma.sector.create({
    data: { slug: `ov-${stamp()}`, label: `Setor ${MARK}`, icon: "Box", order: 999 },
    select: { id: true },
  });
  sectorId = s.id;

  const other = await prisma.sector.create({
    data: { slug: `ovx-${stamp()}`, label: `Outro ${MARK}`, icon: "Box", order: 999 },
    select: { id: true },
  });
  otherSectorId = other.id;

  const sub = await prisma.subsector.create({
    data: {
      slug: `ovsub-${stamp()}`,
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
    data: { title: `Vídeo ${MARK}`, kind: "INSTRUCAO", subsectorId, filePath: "/uploads/x.mp4" },
    select: { id: true },
  });
  videoId = video.id;

  aprovadoId = await makeUser("Aprovado", sectorId);
  reprovadoId = await makeUser("Reprovado", sectorId);
  forasteiroId = await makeUser("Forasteiro", otherSectorId);

  // Aprovado: concluiu e tirou 9.
  await prisma.contentProgress.create({
    data: { userId: aprovadoId, videoId, completed: true, endedAt: new Date() },
  });
  await prisma.videoComprehension.create({
    data: {
      userId: aprovadoId,
      videoId,
      answer: "resposta boa",
      attempt: 1,
      grade: 9,
      gradedAt: new Date(),
    },
  });

  // Reprovado: tirou 4, o vídeo voltou a pendente.
  await prisma.contentProgress.create({
    data: { userId: reprovadoId, videoId, completed: false, completedAt: null },
  });
  await prisma.videoComprehension.create({
    data: {
      userId: reprovadoId,
      videoId,
      answer: "resposta fraca",
      attempt: 1,
      grade: 4,
      gradedAt: new Date(),
    },
  });
});

after(async () => {
  const ids = [aprovadoId, reprovadoId, forasteiroId];
  await prisma.videoComprehension.deleteMany({ where: { userId: { in: ids } } });
  await prisma.contentProgress.deleteMany({ where: { userId: { in: ids } } });
  await prisma.video.deleteMany({ where: { subsectorId } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.subsector.deleteMany({ where: { id: subsectorId } });
  await prisma.sector.deleteMany({ where: { id: { in: [sectorId, otherSectorId] } } });
  await prisma.$disconnect();
});

test("colaborador de outro setor não entra no painel", async () => {
  const out = await getSectorOverview({ sectorId });
  assert.equal(out.members.length, 2);
  assert.ok(!out.members.some((m) => m.userId === forasteiroId));
});

test("quem foi aprovado tem média; quem só reprovou não tem", async () => {
  const out = await getSectorOverview({ sectorId });
  const aprovado = out.members.find((m) => m.userId === aprovadoId);
  const reprovado = out.members.find((m) => m.userId === reprovadoId);

  assert.equal(aprovado?.average, 9);
  assert.equal(aprovado?.progress, 100);
  assert.equal(aprovado?.rejections, 0);

  // Nulo, não zero: ele foi avaliado, mas nenhuma nota dele conta.
  assert.equal(reprovado?.average, null);
  assert.equal(reprovado?.progress, 0);
  assert.equal(reprovado?.rejections, 1);
});

test("a média do setor usa um denominador só e ignora a reprovada", async () => {
  const out = await getSectorOverview({ sectorId });
  assert.equal(out.average, 9);
  assert.equal(out.rejections, 1);
  assert.equal(out.memberCount, 2);
});
