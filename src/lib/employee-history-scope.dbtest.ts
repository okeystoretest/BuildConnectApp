import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { prisma } from "@/lib/db/prisma";
import { getEmployeeHistory } from "./hr-history-data";

/**
 * O recorte por setor no "Histórico do Colaborador", contra o Postgres.
 *
 * Existe por causa de um bug de contagem: a consulta varria todo o acervo
 * PADRAO da empresa, então quem era da Retaguarda, com 40 itens, aparecia
 * devendo 120. Este teste monta exatamente esse cenário — conteúdo no setor
 * da pessoa e MAIS conteúdo num setor onde ela não está — e exige que o de
 * fora não conte.
 *
 * Também cobre a vitrine, que nunca foi material a concluir: se alguém
 * trocar o filtro de setor e derrubar o de `kind` junto, este teste cai.
 */

const MARK = "#HISTSCOPE";
const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

let sectorId = "";
let otherSectorId = "";
let subsectorId = "";
let otherSubsectorId = "";
let vitrineId = "";
let userId = "";

async function makeSector(prefix: string): Promise<string> {
  const s = await prisma.sector.create({
    data: { slug: `${prefix}-${stamp()}`, label: `${prefix} ${MARK}`, icon: "Box", order: 999 },
    select: { id: true },
  });
  return s.id;
}

async function makeSubsector(sector: string, kind: "PADRAO" | "VITRINE"): Promise<string> {
  const sub = await prisma.subsector.create({
    data: {
      slug: `hsub-${stamp()}`,
      label: `Sub ${MARK}`,
      icon: "Box",
      kind,
      order: 1,
      sectorId: sector,
    },
    select: { id: true },
  });
  return sub.id;
}

async function makeVideos(subsector: string, count: number): Promise<void> {
  for (let i = 0; i < count; i += 1) {
    await prisma.video.create({
      data: {
        title: `Vídeo ${i} ${MARK}`,
        kind: "INSTRUCAO",
        subsectorId: subsector,
        filePath: "/uploads/x.mp4",
      },
    });
  }
}

before(async () => {
  sectorId = await makeSector("hist");
  otherSectorId = await makeSector("histx");

  subsectorId = await makeSubsector(sectorId, "PADRAO");
  otherSubsectorId = await makeSubsector(otherSectorId, "PADRAO");
  vitrineId = await makeSubsector(sectorId, "VITRINE");

  // 4 no setor da pessoa, 8 num setor alheio, 3 na vitrine do próprio setor.
  await makeVideos(subsectorId, 4);
  await makeVideos(otherSubsectorId, 8);
  await makeVideos(vitrineId, 3);

  const u = await prisma.user.create({
    data: {
      username: `hist-${stamp()}${MARK}`,
      fullName: `Colaborador ${MARK}`,
      passwordHash: "x",
      role: "COLABORADOR",
      sectorId,
    },
    select: { id: true },
  });
  userId = u.id;

  // Concluiu um vídeo do próprio setor.
  const mine = await prisma.video.findFirst({ where: { subsectorId }, select: { id: true } });
  await prisma.contentProgress.create({
    data: { userId, videoId: mine!.id, completed: true, endedAt: new Date() },
  });
});

after(async () => {
  const subsectors = [subsectorId, otherSubsectorId, vitrineId];
  await prisma.contentProgress.deleteMany({ where: { userId } });
  await prisma.video.deleteMany({ where: { subsectorId: { in: subsectors } } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.subsector.deleteMany({ where: { id: { in: subsectors } } });
  await prisma.sector.deleteMany({ where: { id: { in: [sectorId, otherSectorId] } } });
  await prisma.$disconnect();
});

test("o total conta só o setor de lotação — o acervo alheio fica de fora", async () => {
  const history = await getEmployeeHistory(userId);
  // 4, e não 12: os 8 do outro setor não são material desta pessoa.
  assert.equal(history?.totalItems, 4);
});

test("a vitrine do próprio setor não é material a concluir", async () => {
  const history = await getEmployeeHistory(userId);
  const videos = history?.breakdown.find((b) => b.label === "Vídeos assistidos");
  // 4, e não 7: os 3 da vitrine continuam fora, como sempre estiveram.
  assert.equal(videos?.total, 4);
});

test("as pendências acompanham o mesmo recorte", async () => {
  const history = await getEmployeeHistory(userId);
  assert.equal(history?.doneItems, 1);
  assert.equal(history?.pendingItems, 3);
  const titles = history?.pendingGroups.flatMap((g) => g.items.map((i) => i.title)) ?? [];
  assert.equal(titles.length, 3);
});

test("quem não tem setor de lotação não herda o acervo da empresa", async () => {
  await prisma.user.update({ where: { id: userId }, data: { sectorId: null } });
  try {
    const history = await getEmployeeHistory(userId);
    assert.equal(history?.totalItems, 0);
    assert.equal(history?.pendingItems, 0);
  } finally {
    await prisma.user.update({ where: { id: userId }, data: { sectorId } });
  }
});
