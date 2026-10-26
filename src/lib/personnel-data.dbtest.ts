import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { prisma } from "@/lib/db/prisma";
import { PERSONNEL_CATEGORY_KEYS, countsForProgress } from "./personnel-catalog";
import { addDays, todayBR } from "./personnel-expiry";
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
        folder: "exame-medico-admissional",
        name: `Exame admissional ${MARK}.pdf`,
        kind: "PDF",
        sizeBytes: 1024,
        filePath: "/uploads/pessoal/2026/10/exame.pdf",
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
  assert.equal((await find())?.complete, true, "as obrigatórias cobertas = completo");

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

test("pasta opcional vazia não derruba o 'completo'", async () => {
  const solo = await prisma.user.create({
    data: {
      username: `dp-opc-${stamp()}${MARK}`,
      fullName: `Opcional ${MARK}`,
      passwordHash: "x",
      role: "COLABORADOR",
    },
    select: { id: true },
  });
  const find = async () => (await getPersonnelRoster()).find((p) => p.id === solo.id);

  // Só as pastas que CONTAM, deixando as opcionais vazias de propósito.
  await prisma.personnelFile.createMany({
    data: PERSONNEL_CATEGORY_KEYS.filter(countsForProgress).map((folder) => ({
      ownerId: solo.id,
      folder,
      name: `${folder} ${MARK}.pdf`,
      kind: "PDF" as const,
      sizeBytes: 10,
      filePath: `/uploads/pessoal/2026/10/${folder}.pdf`,
    })),
  });

  const pessoa = await find();
  assert.equal(pessoa?.complete, true, "certidão de filho menor vazia não é falta");
  assert.equal(pessoa?.pendingFolders, 0, "opcional vazia não entra em Pendentes");
  assert.equal(pessoa?.status, "ok");

  await prisma.personnelFile.deleteMany({ where: { ownerId: solo.id } });
  await prisma.user.delete({ where: { id: solo.id } });
});

test("documento vencido tira do 'completo'; a vencer, não", async () => {
  const solo = await prisma.user.create({
    data: {
      username: `dp-venc-${stamp()}${MARK}`,
      fullName: `Vencimento ${MARK}`,
      passwordHash: "x",
      role: "COLABORADOR",
    },
    select: { id: true },
  });
  const find = async () => (await getPersonnelRoster()).find((p) => p.id === solo.id);
  const emDias = (dias: number) =>
    new Date(`${addDays(todayBR(), dias)}T00:00:00Z`);

  await prisma.personnelFile.createMany({
    data: PERSONNEL_CATEGORY_KEYS.filter(countsForProgress).map((folder) => ({
      ownerId: solo.id,
      folder,
      name: `${folder} ${MARK}.pdf`,
      kind: "PDF" as const,
      sizeBytes: 10,
      filePath: `/uploads/pessoal/2026/10/${folder}.pdf`,
    })),
  });
  assert.equal((await find())?.complete, true);

  // A vencer em 10 dias: o documento AINDA vale, então segue completo — e já
  // acende o aviso. São duas informações diferentes, e é por isso que
  // "Completo" não é o mesmo que "Em dia".
  const vencer = async (dias: number) =>
    prisma.personnelFolderExpiry.upsert({
      where: { ownerId_folder: { ownerId: solo.id, folder: "exame-medico-admissional" } },
      update: { expiresAt: emDias(dias) },
      create: { ownerId: solo.id, folder: "exame-medico-admissional", expiresAt: emDias(dias) },
    });

  await vencer(10);
  let pessoa = await find();
  assert.equal(pessoa?.complete, true, "documento a vencer ainda é documento válido");
  assert.equal(pessoa?.status, "cuidado");

  // Vencido ontem: sai de completo.
  await vencer(-1);
  pessoa = await find();
  assert.equal(pessoa?.complete, false, "vencido tira do completo");
  assert.equal(pessoa?.status, "vencido");

  // Documento novo com validade futura: volta sozinho.
  await vencer(400);
  pessoa = await find();
  assert.equal(pessoa?.complete, true, "resolvida a pendência, volta a completo");
  assert.equal(pessoa?.status, "ok");

  await prisma.personnelFolderExpiry.deleteMany({ where: { ownerId: solo.id } });
  await prisma.personnelFile.deleteMany({ where: { ownerId: solo.id } });
  await prisma.user.delete({ where: { id: solo.id } });
});

test("as pastas obrigatórias vêm todas, vazias inclusive", async () => {
  const groups = await getPersonnelFolders(ownerId);
  assert.ok(groups);

  const fixed = groups.flatMap((g) => g.folders).filter((f) => f.fixed);
  // Contra a constante, e não contra um número escrito aqui: trocar o
  // catálogo não deve derrubar um teste que fala sobre OUTRA coisa.
  assert.equal(fixed.length, PERSONNEL_CATEGORY_KEYS.length);

  const exame = fixed.find((f) => f.key === "exame-medico-admissional");
  assert.equal(exame?.files.length, 1);

  // A pasta sem nada entregue continua na tela — é o que a torna útil.
  const ctps = fixed.find((f) => f.key === "ctps");
  assert.equal(ctps?.files.length, 0);
});

test("pasta criada à mão vem como não-fixa — o que muda é a confirmação", async () => {
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

test("pasta modelo excluída some da lista e deixa de ser exigida", async () => {
  const solo = await prisma.user.create({
    data: {
      username: `dp-rm-${stamp()}${MARK}`,
      fullName: `Removida ${MARK}`,
      passwordHash: "x",
      role: "COLABORADOR",
      // Todas as obrigatórias menos "ctps" já entregues.
      personnelRemovedFolders: [],
    },
    select: { id: true },
  });

  await prisma.personnelFile.createMany({
    data: PERSONNEL_CATEGORY_KEYS.filter((k) => k !== "ctps").map((folder) => ({
      ownerId: solo.id,
      folder,
      name: `${folder} ${MARK}.pdf`,
      kind: "PDF" as const,
      sizeBytes: 10,
      filePath: `/uploads/pessoal/2026/10/${folder}.pdf`,
    })),
  });

  const card = async () => (await getPersonnelRoster()).find((p) => p.id === solo.id);
  const keys = async () =>
    (await getPersonnelFolders(solo.id))?.flatMap((g) => g.folders).map((f) => f.key) ?? [];

  assert.ok((await keys()).includes("ctps"), "a pasta modelo começa na lista");
  assert.equal((await card())?.complete, false, "a pasta vazia segura o completo");

  // Excluir a CTPS desta pessoa: some da tela e para de ser cobrada.
  await prisma.user.update({
    where: { id: solo.id },
    data: { personnelRemovedFolders: ["ctps"] },
  });
  assert.equal((await keys()).includes("ctps"), false, "a excluída não é gerada de novo");
  assert.equal((await card())?.complete, true, "o que foi excluído não é exigido");

  // E o grupo inteiro desaparece quando a última pasta dele sai.
  await prisma.user.update({
    where: { id: solo.id },
    data: { personnelRemovedFolders: ["perfil-comportamental", "avaliacoes-desempenho"] },
  });
  await prisma.personnelFile.deleteMany({
    where: { ownerId: solo.id, folder: { in: ["perfil-comportamental", "avaliacoes-desempenho"] } },
  });
  const groups = await getPersonnelFolders(solo.id);
  assert.equal(
    groups?.some((g) => g.label === "Desempenho e comportamento"),
    false,
    "grupo sem pasta nenhuma não vira cabeçalho órfão",
  );

  await prisma.personnelFile.deleteMany({ where: { ownerId: solo.id } });
  await prisma.user.delete({ where: { id: solo.id } });
});

test("arquivo sobrevivente mantém visível a pasta modelo marcada como excluída", async () => {
  const solo = await prisma.user.create({
    data: {
      username: `dp-ghost-${stamp()}${MARK}`,
      fullName: `Fantasma ${MARK}`,
      passwordHash: "x",
      role: "COLABORADOR",
      personnelRemovedFolders: ["aso"],
    },
    select: { id: true },
  });

  // Estado que só uma corrida produz: marcada como removida, mas com arquivo.
  // Nenhum documento pode sumir da tela por causa disso.
  await prisma.personnelFile.create({
    data: {
      ownerId: solo.id,
      folder: "aso",
      name: `ASO ${MARK}.pdf`,
      kind: "PDF",
      sizeBytes: 10,
      filePath: "/uploads/pessoal/2026/10/aso-ghost.pdf",
    },
  });

  const folders = (await getPersonnelFolders(solo.id))?.flatMap((g) => g.folders) ?? [];
  const aso = folders.find((f) => f.key === "aso");
  assert.ok(aso, "pasta removida COM arquivo continua visível");
  assert.equal(aso.files.length, 1);

  await prisma.personnelFile.deleteMany({ where: { ownerId: solo.id } });
  await prisma.user.delete({ where: { id: solo.id } });
});

test("bloco renomeado troca o rótulo sem mexer na chave nem nas pastas", async () => {
  const antes = await getPersonnelFolders(ownerId);
  const bloco = antes?.find((g) => g.key === "documentos");
  assert.equal(bloco?.label, "Documentação do colaborador", "nome de fábrica");
  const pastasAntes = bloco?.folders.map((f) => f.key);

  await prisma.personnelGroupName.upsert({
    where: { key: "documentos" },
    update: { label: "Papelada da admissão" },
    create: { key: "documentos", label: "Papelada da admissão" },
  });

  const depois = (await getPersonnelFolders(ownerId))?.find((g) => g.key === "documentos");
  assert.equal(depois?.label, "Papelada da admissão");
  // A chave amarra as pastas ao bloco: renomear não pode soltá-las.
  assert.deepEqual(depois?.folders.map((f) => f.key), pastasAntes);

  // Apagar a linha devolve o nome de fábrica — ele mora na constante, e não
  // numa segunda cópia gravada no banco.
  await prisma.personnelGroupName.deleteMany({ where: { key: "documentos" } });
  const revertido = (await getPersonnelFolders(ownerId))?.find((g) => g.key === "documentos");
  assert.equal(revertido?.label, "Documentação do colaborador");
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

/**
 * Vencimento: o estado da pasta deixa de ser "tem arquivo?" e passa a ser
 * "tem arquivo VÁLIDO?". É o que pode quebrar calado — a coluna é `DATE`, e
 * meia-noite UTC lida no fuso de Brasília cai no dia anterior.
 */
test("o vencimento pinta a pasta e o card, e o dia é lido sem escorregar", async () => {
  const solo = await prisma.user.create({
    data: {
      username: `dp-venc-${stamp()}${MARK}`,
      fullName: `Vencimento ${MARK}`,
      passwordHash: "x",
      role: "COLABORADOR",
    },
    select: { id: true },
  });

  await prisma.personnelFile.createMany({
    data: PERSONNEL_CATEGORY_KEYS.map((folder) => ({
      ownerId: solo.id,
      folder,
      name: `${folder} ${MARK}.pdf`,
      kind: "PDF" as const,
      sizeBytes: 10,
      filePath: `/uploads/pessoal/2026/10/${folder}.pdf`,
    })),
  });

  const card = async () => (await getPersonnelRoster()).find((p) => p.id === solo.id);
  const exame = async () =>
    (await getPersonnelFolders(solo.id))
      ?.flatMap((g) => g.folders)
      .find((f) => f.key === "exame-medico-admissional");

  assert.equal((await card())?.status, "ok", "dossiê completo e sem vencimento = ok");
  assert.equal((await exame())?.expiresOn, null);

  const inDays = (n: number) => {
    const d = new Date(Date.now() + n * 86_400_000);
    return d.toISOString().slice(0, 10);
  };

  // Dentro da janela de aviso: amarelo.
  const soon = inDays(10);
  await prisma.personnelFolderExpiry.create({
    data: {
      ownerId: solo.id,
      folder: "exame-medico-admissional",
      expiresAt: new Date(`${soon}T00:00:00Z`),
    },
  });
  assert.equal((await exame())?.expiresOn, soon, "o dia gravado é o dia lido de volta");
  assert.equal((await exame())?.status, "cuidado");
  assert.equal((await card())?.status, "cuidado");
  assert.equal((await card())?.warningFolders, 1);

  // Já passou: vermelho.
  await prisma.personnelFolderExpiry.update({
    where: {
      ownerId_folder: { ownerId: solo.id, folder: "exame-medico-admissional" },
    },
    data: { expiresAt: new Date(`${inDays(-1)}T00:00:00Z`) },
  });
  assert.equal((await exame())?.status, "vencido");
  assert.equal((await card())?.status, "vencido");
  assert.equal((await card())?.expiredFolders, 1);

  // Pasta vazia é pendente mesmo vencendo — e pendente ganha de vencido no card.
  await prisma.personnelFile.deleteMany({ where: { ownerId: solo.id, folder: "ctps" } });
  assert.equal((await exame())?.status, "vencido", "a CTPS vazia não muda o exame");
  assert.equal((await card())?.status, "pendente");

  await prisma.personnelFile.deleteMany({ where: { ownerId: solo.id } });
  await prisma.user.delete({ where: { id: solo.id } });
});
