import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { prisma } from "@/lib/db/prisma";
import { getSectorOverview, listScopesForOverview } from "./sector-overview-data";

/**
 * O recorte do painel do Meu Setor, contra o Postgres.
 *
 * A LISTA é o setor: todo mundo lotado nele aparece, numa grade só. Isso vem
 * de 22/09, quando a pílula de subsetor foi removida — ela dividia a equipe em
 * listas que o gestor não pedia e, ao trocar o denominador junto, fazia a
 * MESMA pessoa exibir dois percentuais conforme a pílula aberta.
 *
 * O DENOMINADOR é o subsetor, desde 11/11. Não reabre aquele problema: não há
 * pílula, e cada pessoa tem um escopo só — o dela —, logo um percentual só.
 * O que o painel passou a responder é "quanto falta para ESTA pessoa", e quem
 * está no almoxarifado não deve mais o acervo da Produção inteira.
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

test("os três aparecem na mesma lista, cada um com o denominador DELE", async () => {
  const out = await getSectorOverview({ sectorId });
  const ids = out.members.map((m) => m.userId);
  // A lista continua sendo o setor inteiro: ninguém some por causa da marcação.
  assert.ok(ids.includes(soA));
  assert.ok(ids.includes(soB));
  assert.ok(ids.includes(semMarcacao));

  const total = (id: string) => out.members.find((m) => m.userId === id)?.totalItems;
  // Marcado só no A: deve os 2 do A, e não os 5 do setor.
  assert.equal(total(soA), 2);
  // Marcado só no B: deve os 3 do B.
  assert.equal(total(soB), 3);
  // Sem marcação: deve o setor rastreado inteiro — 5, nunca os 4 da vitrine.
  assert.equal(total(semMarcacao), 5);
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

test("concluir algo FORA do próprio subsetor não mexe no percentual", async () => {
  /*
   * soA está marcado só no A. Um vídeo do B não é material dele — pode ter
   * assistido por curiosidade, pode ter mudado de lotação. Sem o recorte no
   * numerador, ele apareceria com 2 de 2 e o painel diria que terminou um
   * conteúdo que ele não deve.
   */
  const alheio = await prisma.video.findFirst({
    where: { subsectorId: subBId },
    select: { id: true },
  });
  await prisma.contentProgress.create({
    data: { userId: soA, videoId: alheio!.id, completed: true, endedAt: new Date() },
  });

  const out = await getSectorOverview({ sectorId });
  const a = out.members.find((m) => m.userId === soA);
  // Continua 1 de 2 — o vídeo do A, da prova anterior.
  assert.equal(a?.doneItems, 1);
  assert.equal(a?.totalItems, 2);
  assert.equal(a?.progress, 50);
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
