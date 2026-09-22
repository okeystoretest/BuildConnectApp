import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { prisma } from "@/lib/db/prisma";
import { getSectorOverview, listScopesForOverview } from "./sector-overview-data";

/**
 * O recorte do painel do Meu Setor, contra o Postgres.
 *
 * O recorte é o SETOR — só ele. O subsetor foi removido do painel em 22/09:
 * a pílula de subsetor dividia a equipe em listas que o gestor não pedia, e o
 * denominador mudava junto, o que fazia a mesma pessoa ter dois percentuais.
 *
 * O que continua valendo: o material da VITRINE nunca entra no denominador,
 * porque não há o que concluir nela.
 */

const MARK = "#SUBSCOPE";
const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

let sectorId = "";
let subAId = "";
let subBId = "";
let vitrineId = "";
let soA = "";
let soB = "";
let semMarcacao = "";

async function makeUser(name: string, subsectors: string[]): Promise<string> {
  const u = await prisma.user.create({
    data: {
      username: `ss-${stamp()}${MARK}`,
      fullName: `${name} ${MARK}`,
      passwordHash: "x",
      role: "COLABORADOR",
      sectorId,
      subsectors: { create: subsectors.map((subsectorId) => ({ subsectorId })) },
    },
    select: { id: true },
  });
  return u.id;
}

async function makeSubsector(kind: "PADRAO" | "VITRINE", order: number): Promise<string> {
  const sub = await prisma.subsector.create({
    data: {
      slug: `sssub-${stamp()}`,
      label: `Sub${order} ${MARK}`,
      icon: "Box",
      kind,
      order,
      sectorId,
    },
    select: { id: true },
  });
  return sub.id;
}

before(async () => {
  const s = await prisma.sector.create({
    data: { slug: `ss-${stamp()}`, label: `Setor ${MARK}`, icon: "Box", order: 999 },
    select: { id: true },
  });
  sectorId = s.id;

  subAId = await makeSubsector("PADRAO", 1);
  subBId = await makeSubsector("PADRAO", 2);
  vitrineId = await makeSubsector("VITRINE", 3);

  // 2 vídeos no A, 3 no B, 4 na vitrine.
  for (const [sub, n] of [
    [subAId, 2],
    [subBId, 3],
    [vitrineId, 4],
  ] as const) {
    for (let i = 0; i < n; i += 1) {
      await prisma.video.create({
        data: {
          title: `V${i} ${MARK}`,
          kind: "INSTRUCAO",
          subsectorId: sub,
          filePath: "/uploads/x.mp4",
        },
      });
    }
  }

  soA = await makeUser("So A", [subAId]);
  soB = await makeUser("So B", [subBId]);
  semMarcacao = await makeUser("Sem marcacao", []);
});

after(async () => {
  const ids = [soA, soB, semMarcacao];
  const subs = [subAId, subBId, vitrineId];
  await prisma.contentProgress.deleteMany({ where: { userId: { in: ids } } });
  await prisma.userSubsector.deleteMany({ where: { userId: { in: ids } } });
  await prisma.video.deleteMany({ where: { subsectorId: { in: subs } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.subsector.deleteMany({ where: { id: { in: subs } } });
  await prisma.sector.deleteMany({ where: { id: sectorId } });
  await prisma.$disconnect();
});

test("o painel conta todo mundo do setor e todo o material PADRAO", async () => {
  const out = await getSectorOverview({ sectorId });
  assert.equal(out.memberCount, 3);
  // 5, e não 9: a vitrine nunca é material a concluir.
  assert.equal(out.totalItems, 5);
});

test("quem marcou um subsetor conta igual a quem não marcou nenhum", async () => {
  // A marcação de subsetor no cadastro ainda decide o ACESSO da pessoa, mas
  // não divide mais o painel: os três estão no mesmo setor, logo na mesma
  // lista, com o mesmo denominador.
  const out = await getSectorOverview({ sectorId });
  const ids = out.members.map((m) => m.userId);
  assert.ok(ids.includes(soA));
  assert.ok(ids.includes(soB));
  assert.ok(ids.includes(semMarcacao));
  assert.equal(
    out.members.every((m) => m.totalItems === 5),
    true,
  );
});

test("concluir um vídeo move o progresso de quem concluiu, e só dele", async () => {
  const video = await prisma.video.findFirst({
    where: { subsectorId: subAId },
    select: { id: true },
  });
  await prisma.contentProgress.create({
    data: { userId: soA, videoId: video!.id, completed: true, endedAt: new Date() },
  });

  const out = await getSectorOverview({ sectorId });
  assert.equal(out.members.find((m) => m.userId === soA)?.doneItems, 1);
  assert.equal(out.members.find((m) => m.userId === semMarcacao)?.doneItems, 0);
});

test("o seletor traz uma pílula por setor, e nenhuma de subsetor", async () => {
  const scopes = await listScopesForOverview();
  const meus = scopes.filter((s) => s.sectorId === sectorId);
  assert.equal(meus.length, 1);
  assert.equal(meus[0]?.sectorLabel, `Setor ${MARK}`);
  // Nenhum escopo, de setor nenhum, carrega subsetor.
  assert.equal(
    scopes.every((s) => !("subsectorId" in s)),
    true,
  );
});
