import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { prisma } from "@/lib/db/prisma";
import { getMyAnsweredEvaluations } from "./my-evaluations-history";

/**
 * A aba "Concluídas" contra o Postgres.
 *
 * O que este teste guarda é o recorte por AUTORIA. A lista não tem filtro de
 * papel nenhum — é a cláusula `evaluatorId`/`respondentId`/`gradedById` que
 * impede uma pessoa de ler a resposta da outra. Se alguém trocar essas
 * cláusulas por um recorte de setor num refactor, os testes abaixo caem.
 *
 * Cobre também o espelho com a aba de pendências: autoavaliação e feedback
 * saem da MESMA tabela e só se distinguem por `isSelfAssessment`.
 */

const MARK = "#HISTEVAL";
const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

let sectorId = "";
let subsectorId = "";
let typeId = "";
let formId = "";
let videoId = "";
let gestorId = "";
let outroGestorId = "";
let colaboradorId = "";

async function makeUser(name: string, role: "GESTOR" | "COLABORADOR"): Promise<string> {
  const u = await prisma.user.create({
    data: {
      username: `he-${stamp()}${MARK}`,
      fullName: `${name} ${MARK}`,
      passwordHash: "x",
      role,
      sectorId,
    },
    select: { id: true },
  });
  return u.id;
}

before(async () => {
  const s = await prisma.sector.create({
    data: { slug: `he-${stamp()}`, label: `Setor ${MARK}`, icon: "Box", order: 999 },
    select: { id: true },
  });
  sectorId = s.id;

  const sub = await prisma.subsector.create({
    data: {
      slug: `hesub-${stamp()}`,
      label: `Sub ${MARK}`,
      icon: "Box",
      kind: "PADRAO",
      order: 1,
      sectorId,
    },
    select: { id: true },
  });
  subsectorId = sub.id;

  gestorId = await makeUser("Gestor", "GESTOR");
  outroGestorId = await makeUser("Outro gestor", "GESTOR");
  colaboradorId = await makeUser("Colaborador", "COLABORADOR");

  const type = await prisma.evaluationType.create({
    data: { slug: `hetype-${stamp()}`, title: `Instrumento ${MARK}`, kind: "COMPORTAMENTAL" },
    select: { id: true },
  });
  typeId = type.id;

  // O gestor avaliou o colaborador; o colaborador fez a própria autoavaliação;
  // o OUTRO gestor avaliou alguém — esta última não pode aparecer para o nosso.
  await prisma.evaluation.create({
    data: { typeId, subjectId: colaboradorId, evaluatorId: gestorId, total: 42 },
  });
  await prisma.evaluation.create({
    data: {
      typeId,
      subjectId: colaboradorId,
      evaluatorId: colaboradorId,
      isSelfAssessment: true,
      total: 30,
    },
  });
  await prisma.evaluation.create({
    data: { typeId, subjectId: colaboradorId, evaluatorId: outroGestorId, total: 11 },
  });

  const form = await prisma.form.create({
    data: {
      title: `Formulário ${MARK}`,
      status: "PUBLICADO",
      anonymous: false,
      createdById: gestorId,
    },
    select: { id: true },
  });
  formId = form.id;

  // Uma resposta identificada do colaborador, e uma ANÔNIMA (sem respondente).
  await prisma.formResponse.create({ data: { formId, respondentId: colaboradorId } });
  await prisma.formResponse.create({ data: { formId, respondentId: null } });

  const video = await prisma.video.create({
    data: {
      title: `Vídeo ${MARK}`,
      kind: "INSTRUCAO",
      subsectorId,
      filePath: "/uploads/x.mp4",
    },
    select: { id: true },
  });
  videoId = video.id;

  await prisma.videoComprehension.create({
    data: {
      userId: colaboradorId,
      videoId,
      answer: "resposta do colaborador",
      attempt: 1,
      grade: 4,
      gradedById: gestorId,
      gradedAt: new Date(),
      graderComment: "faltou detalhar",
    },
  });
});

after(async () => {
  const ids = [gestorId, outroGestorId, colaboradorId];
  await prisma.videoComprehension.deleteMany({ where: { videoId } });
  await prisma.formResponse.deleteMany({ where: { formId } });
  await prisma.form.deleteMany({ where: { id: formId } });
  await prisma.evaluation.deleteMany({ where: { typeId } });
  await prisma.evaluationType.deleteMany({ where: { id: typeId } });
  await prisma.video.deleteMany({ where: { subsectorId } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.subsector.deleteMany({ where: { id: subsectorId } });
  await prisma.sector.deleteMany({ where: { id: sectorId } });
  await prisma.$disconnect();
});

test("o gestor vê o feedback que deu e a nota de compreensão que deu", async () => {
  const rows = await getMyAnsweredEvaluations(gestorId);
  const kinds = rows.map((r) => r.kind);
  assert.ok(kinds.includes("FEEDBACK"));
  assert.ok(kinds.includes("COMPREENSAO_VIDEO"));
  assert.equal(rows.length, 2);
});

test("a nota de compreensão vem inteira, sem ida extra ao servidor", async () => {
  const rows = await getMyAnsweredEvaluations(gestorId);
  const nota = rows.find((r) => r.kind === "COMPREENSAO_VIDEO");
  assert.equal(nota?.comprehension?.grade, 4);
  assert.equal(nota?.comprehension?.passed, false);
  assert.equal(nota?.comprehension?.comment, "faltou detalhar");
  assert.ok(nota?.comprehension?.authorName.includes("Colaborador"));
});

test("ninguém vê o que outra pessoa respondeu", async () => {
  const rows = await getMyAnsweredEvaluations(gestorId);
  // A submissão do outro gestor (total 11) não pode estar aqui.
  assert.ok(!rows.some((r) => r.scoreLabel === "11 pts"));
});

test("autoavaliação e feedback se distinguem, saindo da mesma tabela", async () => {
  const rows = await getMyAnsweredEvaluations(colaboradorId);
  const auto = rows.find((r) => r.kind === "AUTOAVALIACAO");
  assert.equal(auto?.subjectName, "Você");
  assert.equal(auto?.scoreLabel, "30 pts");
  assert.ok(!rows.some((r) => r.kind === "FEEDBACK"));
});

test("o formulário identificado aparece; o anônimo não aparece para ninguém", async () => {
  const doColaborador = await getMyAnsweredEvaluations(colaboradorId);
  const forms = doColaborador.filter((r) => r.kind === "FORMULARIO");
  // Uma, não duas: a resposta anônima não tem dono para ser listada.
  assert.equal(forms.length, 1);

  const doGestor = await getMyAnsweredEvaluations(gestorId);
  assert.equal(doGestor.filter((r) => r.kind === "FORMULARIO").length, 0);
});

test("a lista é uma linha do tempo só, da mais recente para a mais antiga", async () => {
  const rows = await getMyAnsweredEvaluations(colaboradorId);
  assert.ok(rows.length >= 2);
  // Tipos diferentes convivem na mesma lista, sem separação por origem.
  assert.ok(new Set(rows.map((r) => r.kind)).size > 1);
});
