import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { prisma } from "@/lib/db/prisma";
import { PERSONNEL_CATEGORY_KEYS } from "./personnel-catalog";
import { getPersonnelFolders, getPersonnelRoster } from "./personnel-data";

/**
 * As pastas do Departamento Pessoal, contra o Postgres.
 *
 * O que este teste trava é justamente o que a estrutura escolhida pode quebrar
 * em silêncio:
 *
 *  1. a pasta por colaborador é DERIVADA da lista de ativos — desativar um
 *     cadastro tem de tirar a pasta da tela sem apagar arquivo nenhum;
 *  2. as pastas obrigatórias aparecem SEMPRE, vazias inclusive: é a pasta
 *     vazia que diz o que falta entregar;
 *  3. um arquivo cuja pasta saiu da lista do colaborador NÃO desaparece — ele
 *     cai em "Outras pastas". Sem isso, remover um nome do array esconderia
 *     documento admissional sem avisar ninguém.
 */

const MARK = "#DPTEST";
const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

let ownerId = "";

before(async () => {
  const owner = await prisma.user.create({
    data: {
      username: `dp-${stamp()}${MARK}`,
      fullName: `Colaborador ${MARK}`,
      passwordHash: "x",
      role: "COLABORADOR",
      personnelFolders: ["Advertências"],
    },
    select: { id: true },
  });
  ownerId = owner.id;

  await prisma.personnelFile.createMany({
    data: [
      {
        ownerId,
        folder: "aso",
        name: `ASO admissional ${MARK}.pdf`,
        kind: "PDF",
        sizeBytes: 1024,
        filePath: "/uploads/pessoal/2026/10/aso.pdf",
      },
      {
        ownerId,
        folder: "Advertências",
        name: `Advertência ${MARK}.pdf`,
        kind: "PDF",
        sizeBytes: 2048,
        filePath: "/uploads/pessoal/2026/10/adv.pdf",
      },
      // Pasta que não é do catálogo NEM está mais no array do colaborador.
      {
        ownerId,
        folder: "Pasta Extinta",
        name: `Órfão ${MARK}.pdf`,
        kind: "PDF",
        sizeBytes: 512,
        filePath: "/uploads/pessoal/2026/10/orfao.pdf",
      },
    ],
  });
});

after(async () => {
  await prisma.personnelFile.deleteMany({ where: { ownerId } });
  await prisma.user.deleteMany({ where: { id: ownerId } });
  await prisma.$disconnect();
});

test("o colaborador ativo entra na lista com a contagem de arquivos", async () => {
  const roster = await getPersonnelRoster();
  const mine = roster.find((p) => p.id === ownerId);
  assert.ok(mine, "colaborador ativo tem de aparecer na lista");
  assert.equal(mine.fileCount, 3);
  // 3 arquivos, mas 10 das 11 obrigatórias vazias: entregou, não terminou.
  assert.equal(mine.complete, false);
});

test("'completo' exige TODA pasta com arquivo — a extra vazia também conta", async () => {
  const solo = await prisma.user.create({
    data: {
      username: `dp-full-${stamp()}${MARK}`,
      fullName: `Completo ${MARK}`,
      passwordHash: "x",
      role: "COLABORADOR",
    },
    select: { id: true },
  });

  const onePerFolder = async () =>
    prisma.personnelFile.createMany({
      data: PERSONNEL_CATEGORY_KEYS.map((folder) => ({
        ownerId: solo.id,
        folder,
        name: `${folder} ${MARK}.pdf`,
        kind: "PDF" as const,
        sizeBytes: 10,
        filePath: `/uploads/pessoal/2026/10/${folder}.pdf`,
      })),
    });

  const find = async () => (await getPersonnelRoster()).find((p) => p.id === solo.id);

  assert.equal((await find())?.complete, false, "sem arquivo nenhum não é completo");

  await onePerFolder();
  assert.equal((await find())?.complete, true, "as 11 obrigatórias cobertas = completo");

  // Criar uma pasta extra reabre a pendência: ela nasce vazia, e é vermelha
  // na tela de pastas — o card não pode dizer que está tudo entregue.
  await prisma.user.update({
    where: { id: solo.id },
    data: { personnelFolders: ["Advertências"] },
  });
  assert.equal((await find())?.complete, false, "pasta extra vazia derruba o completo");

  await prisma.personnelFile.create({
    data: {
      ownerId: solo.id,
      folder: "Advertências",
      name: `Adv ${MARK}.pdf`,
      kind: "PDF",
      sizeBytes: 10,
      filePath: "/uploads/pessoal/2026/10/adv2.pdf",
    },
  });
  assert.equal((await find())?.complete, true, "extra preenchida devolve o completo");

  await prisma.personnelFile.deleteMany({ where: { ownerId: solo.id } });
  await prisma.user.delete({ where: { id: solo.id } });
});

test("as pastas obrigatórias vêm todas, vazias inclusive", async () => {
  const groups = await getPersonnelFolders(ownerId);
  assert.ok(groups);

  const fixed = groups.flatMap((g) => g.folders).filter((f) => f.fixed);
  assert.equal(fixed.length, 11);

  const aso = fixed.find((f) => f.key === "aso");
  assert.equal(aso?.files.length, 1);

  // A pasta sem nada entregue continua na tela — é o que a torna útil.
  const ctps = fixed.find((f) => f.key === "ctps");
  assert.equal(ctps?.files.length, 0);
});

test("pasta criada à mão vem como não-fixa (só ela pode ser excluída)", async () => {
  const groups = await getPersonnelFolders(ownerId);
  const extra = groups?.flatMap((g) => g.folders).find((f) => f.key === "Advertências");
  assert.equal(extra?.fixed, false);
  assert.equal(extra?.files.length, 1);
});

test("arquivo de pasta fora da lista não desaparece — vai para Outras pastas", async () => {
  const groups = await getPersonnelFolders(ownerId);
  const orphan = groups?.flatMap((g) => g.folders).find((f) => f.key === "Pasta Extinta");
  assert.ok(orphan, "a pasta do arquivo tem de ser mostrada mesmo fora do array");
  assert.equal(orphan.files.length, 1);
});

test("colaborador inativo sai da lista e das pastas, sem perder arquivo", async () => {
  await prisma.user.update({ where: { id: ownerId }, data: { active: false } });

  const roster = await getPersonnelRoster();
  assert.equal(roster.some((p) => p.id === ownerId), false);
  assert.equal(await getPersonnelFolders(ownerId), null);

  // Os arquivos continuam no banco: desativar não é demitir o arquivo.
  assert.equal(await prisma.personnelFile.count({ where: { ownerId } }), 3);

  await prisma.user.update({ where: { id: ownerId }, data: { active: true } });
});
