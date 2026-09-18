import assert from "node:assert/strict";
import test, { after, before, beforeEach } from "node:test";
import { prisma } from "@/lib/db/prisma";
import { notifyCycleAvailableInApp, notifyFormAvailableInApp, notifyNewContent } from "./notify";

/**
 * Os gatilhos do sino contra o Postgres: quem recebe o quê.
 */

const MARK = "#NOTIFTRIG";
const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

let sectorId = "";
let padrao = "";
let vitrine = "";
let gestor = "";
let colab = "";
const formIds: string[] = [];

async function makeUser(role: "COLABORADOR" | "GESTOR", sector: string | null): Promise<string> {
  const u = await prisma.user.create({
    data: {
      username: `nt-${stamp()}${MARK}`,
      fullName: `Pessoa ${MARK}`,
      passwordHash: "x",
      role,
      sectorId: sector,
    },
    select: { id: true },
  });
  return u.id;
}

before(async () => {
  const sector = await prisma.sector.create({
    data: { slug: `setor-${stamp()}${MARK}`, label: "Setor", icon: "Box" },
    select: { id: true },
  });
  sectorId = sector.id;
  padrao = `padrao-${stamp()}${MARK}`;
  vitrine = `vitrine-${stamp()}${MARK}`;
  await prisma.subsector.create({ data: { slug: padrao, label: "Padrão", icon: "Box", sectorId } });
  await prisma.subsector.create({
    data: { slug: vitrine, label: "Vitrine", icon: "Box", sectorId, kind: "VITRINE" },
  });
  gestor = await makeUser("GESTOR", sectorId);
  colab = await makeUser("COLABORADOR", sectorId);
});

beforeEach(async () => {
  await prisma.notification.deleteMany({ where: { body: { contains: MARK } } });
  await prisma.notification.deleteMany({ where: { targetUserId: { in: [gestor, colab] } } });
});

after(async () => {
  await prisma.notification.deleteMany({ where: { body: { contains: MARK } } });
  await prisma.form.deleteMany({ where: { id: { in: formIds } } });
  await prisma.sector.deleteMany({ where: { id: sectorId } });
  await prisma.user.deleteMany({ where: { username: { contains: MARK } } });
});

test("novo vídeo em subsetor PADRAO notifica o subsetor, com link para ele", async () => {
  await notifyNewContent({ slug: padrao, kind: "video", title: `Vídeo ${MARK}` });
  const rows = await prisma.notification.findMany({ where: { body: { contains: MARK } } });
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.kind, "CONTEUDO");
  assert.deepEqual(rows[0]!.audience, [padrao]);
  assert.equal(rows[0]!.href, `/setores/${padrao}`);
  assert.match(rows[0]!.title, /vídeo/i);
  assert.match(rows[0]!.title, /Padrão/);
});

test("novo documento em VITRINE não notifica", async () => {
  await notifyNewContent({ slug: vitrine, kind: "document", title: `Doc ${MARK}` });
  assert.equal(await prisma.notification.count({ where: { body: { contains: MARK } } }), 0);
});

test("slug inexistente não lança nem grava", async () => {
  await notifyNewContent({ slug: "nao-existe", kind: "document", title: `Doc ${MARK}` });
  assert.equal(await prisma.notification.count({ where: { body: { contains: MARK } } }), 0);
});

test("formulário disponível: uma notificação individual por atribuição pendente", async () => {
  const form = await prisma.form.create({
    data: { title: `Pesquisa ${MARK}`, status: "PUBLICADO", currentRound: 1 },
    select: { id: true },
  });
  formIds.push(form.id);
  await prisma.formAssignment.createMany({
    data: [
      { formId: form.id, userId: gestor },
      { formId: form.id, userId: colab, status: "CONCLUIDA" },
    ],
  });

  await notifyFormAvailableInApp(form.id);

  const rows = await prisma.notification.findMany({
    where: { kind: "FORMULARIO", targetUserId: { in: [gestor, colab] } },
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.targetUserId, gestor);
  assert.equal(rows[0]!.href, "/minhas-avaliacoes");
  assert.deepEqual(rows[0]!.audience, []);
});

test("ciclo Pré-Efetivo: só os GESTORES do setor, individualmente", async () => {
  await prisma.$transaction(async (tx) => {
    await notifyCycleAvailableInApp(tx, { sectorId, subjectName: `Fulano ${MARK}`, cycle: 2 });
  });
  const rows = await prisma.notification.findMany({ where: { body: { contains: MARK } } });
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.targetUserId, gestor);
  assert.equal(rows[0]!.kind, "AVALIACAO");
  assert.deepEqual(rows[0]!.audience, []);
});
