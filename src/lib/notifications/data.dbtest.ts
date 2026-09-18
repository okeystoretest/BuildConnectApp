import assert from "node:assert/strict";
import test, { after, before, beforeEach } from "node:test";
import { prisma } from "@/lib/db/prisma";
import { dismissAll, listMyNotifications, markAllRead, markRead } from "./data";

/**
 * O sino contra o Postgres: recorte por usuário, leitura e "Limpar".
 */

const MARK = "#NOTIFDATA";
const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

let sectorId = "";
let slug = "";
let colab = "";
let outro = "";

async function makeUser(role: "COLABORADOR" | "ADMIN", sector: string | null): Promise<string> {
  const u = await prisma.user.create({
    data: {
      username: `nd-${stamp()}${MARK}`,
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
  slug = `sub-${stamp()}${MARK}`;
  await prisma.subsector.create({ data: { slug, label: "Sub", icon: "Box", sectorId } });
  colab = await makeUser("COLABORADOR", sectorId);
  outro = await makeUser("COLABORADOR", null);
});

beforeEach(async () => {
  await prisma.notification.deleteMany({ where: { title: { contains: MARK } } });
});

after(async () => {
  await prisma.notification.deleteMany({ where: { title: { contains: MARK } } });
  await prisma.sector.deleteMany({ where: { id: sectorId } });
  await prisma.user.deleteMany({ where: { username: { contains: MARK } } });
});

async function seed(over: { audience?: string[]; targetUserId?: string; title?: string }) {
  return prisma.notification.create({
    data: {
      kind: "CONTEUDO",
      title: over.title ?? `T ${MARK}`,
      body: "b",
      audience: over.audience ?? [],
      targetUserId: over.targetUserId ?? null,
    },
    select: { id: true },
  });
}

test("lista só o que é do meu subsetor, geral ou dirigido a mim; não lida por padrão", async () => {
  await seed({ audience: [slug], title: `sub ${MARK}` });
  await seed({ audience: ["*"], title: `geral ${MARK}` });
  await seed({ targetUserId: colab, title: `minha ${MARK}` });
  await seed({ targetUserId: outro, title: `alheia ${MARK}` });
  await seed({ audience: ["outro-slug"], title: `outra ${MARK}` });

  const list = await listMyNotifications(colab, "COLABORADOR");
  const titles = list.map((n) => n.title).sort();
  assert.deepEqual(titles, [`geral ${MARK}`, `minha ${MARK}`, `sub ${MARK}`]);
  assert.ok(list.every((n) => n.read === false));
});

test("markRead marca uma; markAllRead marca todas as visíveis; ambas persistem", async () => {
  const a = await seed({ audience: [slug] });
  await seed({ audience: [slug] });

  await markRead(colab, a.id);
  let list = await listMyNotifications(colab, "COLABORADOR");
  assert.equal(list.filter((n) => n.read).length, 1);

  await markAllRead(colab, "COLABORADOR");
  list = await listMyNotifications(colab, "COLABORADOR");
  assert.equal(list.length, 2);
  assert.ok(list.every((n) => n.read));
});

test("dismissAll some da lista deste usuário e não afeta os outros", async () => {
  await seed({ audience: ["*"] });
  await dismissAll(colab, "COLABORADOR");
  assert.equal((await listMyNotifications(colab, "COLABORADOR")).length, 0);
  assert.equal((await listMyNotifications(outro, "COLABORADOR")).length, 1);
});

test("markRead em notificação que não é minha não grava nada", async () => {
  const alheia = await seed({ targetUserId: outro });
  await markRead(colab, alheia.id);
  const reads = await prisma.notificationRead.count({ where: { notificationId: alheia.id } });
  assert.equal(reads, 0);
});
