import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { prisma } from "@/lib/db/prisma";
import { DHO_SLUG, canReadPersonnelOf } from "./auth/access";
import type { Role } from "@/types";

/**
 * Quem alcança a documentação pessoal de um colaborador, contra o Postgres.
 *
 * Este é o portão de RG, CPF, CTPS, ASO e dado bancário — a resposta dele
 * decide o que a tela de "Meu Setor" mostra, o que a rota de imagem renderiza
 * e o que `/uploads/pessoal` entrega. Errar aqui não quebra nada à vista:
 * entrega documento a quem não devia, em silêncio.
 *
 * O caso que mais importa é o do GESTOR SEM a permissão marcada. Ser gestor do
 * setor NÃO basta, e essa é a única linha entre "o checkbox do cadastro vale"
 * e "todo gestor vê tudo da equipe". Se alguém simplificar o predicado para
 * "mesmo setor", este teste cai.
 */

const MARK = "#PERSSCOPE";
const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

let sectorId = "";
let otherSectorId = "";
let dhoSectorId = "";
/** O DHO pode já existir no banco; só apagamos o que este teste criou. */
let criamosDho = false;

let owner = "";
let ownerSemSetor = "";
let admin = "";
let gestorDho = "";
let gestorComAcesso = "";
let gestorOutroSetor = "";
let gestorSemAcesso = "";
let colaboradorComAcesso = "";
let gestorSemSetor = "";

async function makeSector(prefix: string): Promise<string> {
  const s = await prisma.sector.create({
    data: { slug: `${prefix}-${stamp()}`, label: `${prefix} ${MARK}`, icon: "Box", order: 999 },
    select: { id: true },
  });
  return s.id;
}

async function makeUser(
  role: Role,
  sector: string | null,
  canViewSectorDocs: boolean,
): Promise<string> {
  const u = await prisma.user.create({
    data: {
      username: `pscope-${stamp()}${MARK}`,
      fullName: `Pessoa ${MARK}`,
      passwordHash: "x",
      role,
      sectorId: sector,
      canViewSectorDocs,
    },
    select: { id: true },
  });
  return u.id;
}

before(async () => {
  sectorId = await makeSector("pscope");
  otherSectorId = await makeSector("pscopex");

  // O DHO é identificado pelo SLUG, que é único: reaproveita o que existir.
  const dho = await prisma.sector.findUnique({ where: { slug: DHO_SLUG }, select: { id: true } });
  if (dho) {
    dhoSectorId = dho.id;
  } else {
    const criado = await prisma.sector.create({
      data: { slug: DHO_SLUG, label: `DHO ${MARK}`, icon: "Box", order: 998 },
      select: { id: true },
    });
    dhoSectorId = criado.id;
    criamosDho = true;
  }

  owner = await makeUser("COLABORADOR", sectorId, false);
  ownerSemSetor = await makeUser("COLABORADOR", null, false);
  admin = await makeUser("ADMIN", null, false);
  gestorDho = await makeUser("GESTOR", dhoSectorId, false);
  gestorComAcesso = await makeUser("GESTOR", sectorId, true);
  gestorOutroSetor = await makeUser("GESTOR", otherSectorId, true);
  gestorSemAcesso = await makeUser("GESTOR", sectorId, false);
  colaboradorComAcesso = await makeUser("COLABORADOR", sectorId, true);
  gestorSemSetor = await makeUser("GESTOR", null, true);
});

after(async () => {
  await prisma.user.deleteMany({ where: { username: { contains: MARK } } });
  await prisma.sector.deleteMany({ where: { id: { in: [sectorId, otherSectorId] } } });
  if (criamosDho) await prisma.sector.deleteMany({ where: { id: dhoSectorId } });
  await prisma.$disconnect();
});

test("o Admin alcança qualquer colaborador, sem permissão marcada e sem setor", async () => {
  assert.equal(await canReadPersonnelOf(admin, "ADMIN", owner), true);
  assert.equal(await canReadPersonnelOf(admin, "ADMIN", ownerSemSetor), true);
});

test("o Gestor do DHO alcança quem é de OUTRO setor — a ferramenta é dele", async () => {
  assert.equal(await canReadPersonnelOf(gestorDho, "GESTOR", owner), true);
});

test("o Gestor do setor alcança a própria equipe quando tem a permissão", async () => {
  assert.equal(await canReadPersonnelOf(gestorComAcesso, "GESTOR", owner), true);
});

test("o Gestor SEM a permissão não alcança, nem a própria equipe", async () => {
  // A linha entre "o checkbox do cadastro vale" e "todo gestor vê tudo".
  assert.equal(await canReadPersonnelOf(gestorSemAcesso, "GESTOR", owner), false);
});

test("o Gestor de outro setor não alcança, mesmo com a permissão", async () => {
  assert.equal(await canReadPersonnelOf(gestorOutroSetor, "GESTOR", owner), false);
});

test("Colaborador não alcança, nem com a permissão ligada por engano", async () => {
  // A coluna só faz sentido para GESTOR; o cadastro a zera para os demais.
  // Esta é a segunda tranca: se a primeira falhar, a leitura ainda recusa.
  assert.equal(await canReadPersonnelOf(colaboradorComAcesso, "COLABORADOR", owner), false);
});

test("sem lotação, dois nulos não 'compartilham setor'", async () => {
  assert.equal(await canReadPersonnelOf(gestorSemSetor, "GESTOR", ownerSemSetor), false);
});

test("desmarcar a permissão vale na leitura seguinte, sem novo login", async () => {
  assert.equal(await canReadPersonnelOf(gestorComAcesso, "GESTOR", owner), true);
  await prisma.user.update({
    where: { id: gestorComAcesso },
    data: { canViewSectorDocs: false },
  });
  try {
    assert.equal(await canReadPersonnelOf(gestorComAcesso, "GESTOR", owner), false);
  } finally {
    await prisma.user.update({
      where: { id: gestorComAcesso },
      data: { canViewSectorDocs: true },
    });
  }
});
