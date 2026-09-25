import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { prisma } from "@/lib/db/prisma";
import { getEmployeeHistory } from "./hr-history-data";

/**
 * A primeira página da linha do tempo chega junto do histórico.
 *
 * Existe porque a alternativa pisca: abrir um colaborador e só então disparar
 * uma segunda ida ao servidor deixaria o bloco vazio a cada seleção.
 *
 * O caso do recém-cadastrado trava o outro extremo: uma linha só, sem cursor,
 * sem botão de carregar mais.
 */

const MARK = "#ACTACT";
const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

let sectorId = "";
let novatoId = "";

before(async () => {
  const s = await prisma.sector.create({
    data: { slug: `actact-${stamp()}`, label: `Setor ${MARK}`, icon: "Box", order: 999 },
    select: { id: true },
  });
  sectorId = s.id;

  const u = await prisma.user.create({
    data: {
      username: `actact-${stamp()}${MARK}`,
      fullName: `Novato ${MARK}`,
      passwordHash: "x",
      role: "COLABORADOR",
      sectorId,
    },
    select: { id: true },
  });
  novatoId = u.id;
});

after(async () => {
  await prisma.activityEvent.deleteMany({ where: { userId: novatoId } });
  await prisma.user.deleteMany({ where: { id: novatoId } });
  await prisma.sector.deleteMany({ where: { id: sectorId } });
  await prisma.$disconnect();
});

test("o histórico já vem com a primeira página da atividade", async () => {
  const history = await getEmployeeHistory(novatoId);
  assert.ok(history);
  assert.ok(Array.isArray(history.activity.events));
});

test("recém-cadastrado tem uma linha só: o cadastro, e nenhum cursor", async () => {
  const history = await getEmployeeHistory(novatoId);
  assert.ok(history);
  assert.equal(history.activity.events.length, 1);
  assert.equal(history.activity.events[0]?.kind, "CADASTRO");
  assert.equal(history.activity.nextCursor, null);
});

test("um login novo entra na frente do cadastro", async () => {
  await prisma.activityEvent.create({ data: { userId: novatoId, kind: "LOGIN" } });
  const history = await getEmployeeHistory(novatoId);
  assert.ok(history);
  assert.equal(history.activity.events.length, 2);
  assert.equal(history.activity.events[0]?.kind, "LOGIN");
  assert.equal(history.activity.events[1]?.kind, "CADASTRO");
});
