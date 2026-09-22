import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { prisma } from "@/lib/db/prisma";
import { getSectorOverview, listScopesForOverview } from "./sector-overview-data";

/**
 * O recorte por subsetor das pílulas do Meu Setor, contra o Postgres.
 *
 * O cenário que importa é o do cadastro pela metade: marcar subsetores é
 * opcional, e quem não marca nenhum acessa TODOS os do seu setor. O painel
 * segue essa mesma regra — se ele inventasse outra, o gestor veria uma equipe
 * e a pessoa teria acesso a outra.
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

test("a pílula do setor mostra todo mundo e todo o material PADRAO", async () => {
  const out = await getSectorOverview({ sectorId });
  assert.equal(out.memberCount, 3);
  // 5, e não 9: a vitrine nunca é material a concluir.
  assert.equal(out.totalItems, 5);
  assert.equal(out.subsectorLabel, undefined);
});

test("a pílula de subsetor recorta as pessoas E o denominador", async () => {
  const out = await getSectorOverview({ sectorId, subsectorId: subAId });
  // Quem marcou o A, mais quem não marcou nada — nunca quem marcou só o B.
  assert.equal(out.memberCount, 2);
  assert.ok(out.members.some((m) => m.userId === soA));
  assert.ok(out.members.some((m) => m.userId === semMarcacao));
  assert.ok(!out.members.some((m) => m.userId === soB));
  // O denominador vira o do subsetor: 2 itens, não os 5 do setor.
  assert.equal(out.totalItems, 2);
  assert.equal(out.members.every((m) => m.totalItems === 2), true);
});

test("o outro subsetor recorta para o outro lado", async () => {
  const out = await getSectorOverview({ sectorId, subsectorId: subBId });
  assert.equal(out.memberCount, 2);
  assert.ok(out.members.some((m) => m.userId === soB));
  assert.ok(out.members.some((m) => m.userId === semMarcacao));
  assert.equal(out.totalItems, 3);
});

test("concluir no subsetor A não move o progresso do subsetor B", async () => {
  const video = await prisma.video.findFirst({
    where: { subsectorId: subAId },
    select: { id: true },
  });
  await prisma.contentProgress.create({
    data: { userId: soA, videoId: video!.id, completed: true, endedAt: new Date() },
  });

  const a = await getSectorOverview({ sectorId, subsectorId: subAId });
  assert.equal(a.members.find((m) => m.userId === soA)?.doneItems, 1);

  const b = await getSectorOverview({ sectorId, subsectorId: subBId });
  assert.equal(b.members.find((m) => m.userId === semMarcacao)?.doneItems, 0);
});

test("as pílulas trazem o setor e seus subsetores PADRAO, nunca a vitrine", async () => {
  const scopes = await listScopesForOverview();
  const meus = scopes.filter((s) => s.sectorId === sectorId);
  assert.equal(meus.length, 3); // o setor + dois subsetores
  assert.equal(meus[0]?.subsectorId, undefined);
  assert.ok(!meus.some((s) => s.subsectorId === vitrineId));
});
