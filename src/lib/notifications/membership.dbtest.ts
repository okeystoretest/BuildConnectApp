import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { prisma } from "@/lib/db/prisma";
import { activeUserIdsInSector } from "./membership";

/**
 * Lotação por SETOR — o recorte da notificação de integração, que avisa a
 * equipe inteira e não um subsetor. Contra o Postgres porque a regra é a
 * consulta: não há o que provar em memória.
 */

const MARK = "#MEMBSECTOR";
const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

let sectorId = "";
let outroSetorId = "";
let gestor = "";
let colab = "";
let inativo = "";
let deOutroSetor = "";

async function makeUser(
  role: "COLABORADOR" | "GESTOR",
  sector: string | null,
  active = true,
): Promise<string> {
  const u = await prisma.user.create({
    data: {
      username: `ms-${stamp()}${MARK}`,
      fullName: `Pessoa ${MARK}`,
      passwordHash: "x",
      role,
      sectorId: sector,
      active,
    },
    select: { id: true },
  });
  return u.id;
}

before(async () => {
  const s = await prisma.sector.create({
    data: { slug: `setor-${stamp()}${MARK}`, label: "Setor", icon: "Box" },
    select: { id: true },
  });
  sectorId = s.id;
  const o = await prisma.sector.create({
    data: { slug: `outro-${stamp()}${MARK}`, label: "Outro", icon: "Box" },
    select: { id: true },
  });
  outroSetorId = o.id;

  gestor = await makeUser("GESTOR", sectorId);
  colab = await makeUser("COLABORADOR", sectorId);
  inativo = await makeUser("COLABORADOR", sectorId, false);
  deOutroSetor = await makeUser("COLABORADOR", outroSetorId);
});

after(async () => {
  await prisma.user.deleteMany({ where: { username: { contains: MARK } } });
  await prisma.sector.deleteMany({ where: { id: { in: [sectorId, outroSetorId] } } });
});

test("activeUserIdsInSector: traz gestores e colaboradores ativos do setor", async () => {
  const ids = await activeUserIdsInSector(sectorId);
  assert.ok(ids.includes(gestor), "o gestor do setor deve estar na lista");
  assert.ok(ids.includes(colab), "o colaborador do setor deve estar na lista");
});

test("activeUserIdsInSector: ignora inativos e quem é de outro setor", async () => {
  const ids = await activeUserIdsInSector(sectorId);
  assert.ok(!ids.includes(inativo), "usuário inativo não deve ser notificado");
  assert.ok(!ids.includes(deOutroSetor), "usuário de outro setor não deve ser notificado");
});

test("activeUserIdsInSector: setor nulo não traz ninguém", async () => {
  assert.deepEqual(await activeUserIdsInSector(null), []);
});
