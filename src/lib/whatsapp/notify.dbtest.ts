import assert from "node:assert/strict";
import test, { after, beforeEach } from "node:test";
import { prisma } from "@/lib/db/prisma";
import { notifyCycleAvailable, notifyFormAvailable, notifyNewEmployee } from "./notify";
import { publishFormFor, reopenFormFor, closeFormFor, saveFormFor, type FormActor } from "@/lib/forms/core";
import type { FormDraft } from "@/types/form";

/**
 * Os gatilhos, ponta a ponta contra o Postgres.
 *
 * Prova o que liga o negócio à fila: publicar um formulário enfileira para
 * QUEM foi designado — nem mais, nem menos. É a parte que um teste puro não
 * alcança, porque "quem é elegível" é uma consulta, não uma conta.
 */

const MARK = "#NOTIFYTEST";
const ADMIN: FormActor = { id: "", role: "ADMIN", sectorId: null };
const formIds: string[] = [];

async function makeUser(role: "COLABORADOR" | "GESTOR", sectorId: string | null): Promise<string> {
  const u = await prisma.user.create({
    data: {
      username: `n-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${MARK}`,
      fullName: `Pessoa ${MARK}`,
      passwordHash: "x",
      role,
      sectorId,
      phone: "11987654321",
    },
    select: { id: true },
  });
  return u.id;
}

function draft(formId: string): FormDraft {
  return {
    id: formId,
    title: "Pesquisa",
    status: "RASCUNHO",
    anonymous: false,
    currentRound: 1,
    questions: [
      {
        id: `${formId}-q`,
        kind: "MULTIPLA_ESCOLHA",
        label: "P",
        required: false,
        order: 0,
        options: [{ id: `${formId}-o`, label: "Sim", order: 0 }],
      },
    ],
  };
}

async function limpar() {
  await prisma.form.deleteMany({ where: { id: { in: formIds } } });
  await prisma.user.deleteMany({ where: { username: { contains: MARK } } });
}

beforeEach(limpar);
after(async () => {
  await limpar();
  await prisma.$disconnect();
});

async function novoFormulario(): Promise<string> {
  const f = await prisma.form.create({
    data: { title: `F ${MARK}`, ownerSectorId: null },
    select: { id: true },
  });
  formIds.push(f.id);
  await saveFormFor(ADMIN, { formId: f.id, draft: draft(f.id) });
  return f.id;
}

test("publicar formulário enfileira para exatamente os designados", async () => {
  const alvo1 = await makeUser("COLABORADOR", null);
  const alvo2 = await makeUser("COLABORADOR", null);
  const deFora = await makeUser("COLABORADOR", null);
  const formId = await novoFormulario();

  const res = await publishFormFor(ADMIN, {
    formId,
    userIds: [alvo1, alvo2],
    sectorIds: [],
    anonymous: false,
  });
  assert.equal(res.ok, true, res.error);

  const fila = await prisma.whatsappMessage.findMany({
    where: { userId: { in: [alvo1, alvo2, deFora] } },
    select: { userId: true, kind: true, status: true },
  });

  assert.equal(fila.length, 2, "um por destinatário, e ninguém a mais");
  assert.deepEqual(fila.map((m) => m.userId).sort(), [alvo1, alvo2].sort());
  assert.ok(fila.every((m) => m.kind === "FORMULARIO" && m.status === "PENDENTE"));
  assert.equal(
    fila.filter((m) => m.userId === deFora).length,
    0,
    "quem não foi designado não recebe",
  );
});

test("reabrir avisa todo mundo de novo — é coleta nova", async () => {
  const alvo = await makeUser("COLABORADOR", null);
  const formId = await novoFormulario();

  await publishFormFor(ADMIN, { formId, userIds: [alvo], sectorIds: [], anonymous: false });
  assert.equal(await prisma.whatsappMessage.count({ where: { userId: alvo } }), 1);

  await closeFormFor(ADMIN, formId);
  await reopenFormFor(ADMIN, formId);

  assert.equal(
    await prisma.whatsappMessage.count({ where: { userId: alvo } }),
    2,
    "a rodada nova gera um aviso novo",
  );
});

test("formulário sem ninguém pendente não enfileira nada", async () => {
  const formId = await novoFormulario();
  await notifyFormAvailable(formId);
  assert.equal(await prisma.whatsappMessage.count({ where: { user: { username: { contains: MARK } } } }), 0);
});

test("ciclo liberado avisa o GESTOR do setor, e só ele", async () => {
  const setor = await prisma.sector.findFirst({ select: { id: true } });
  assert.ok(setor, "o seed precisa ter criado setores");

  const gestor = await makeUser("GESTOR", setor.id);
  const colaborador = await makeUser("COLABORADOR", setor.id);
  const gestorDeOutroSetor = await makeUser("GESTOR", null);

  await notifyCycleAvailable(setor.id);

  const fila = await prisma.whatsappMessage.findMany({
    where: { userId: { in: [gestor, colaborador, gestorDeOutroSetor] } },
    select: { userId: true },
  });
  assert.deepEqual(
    fila.map((m) => m.userId),
    [gestor],
    "avisar o setor inteiro seria contar a dezenas sobre trabalho que não é delas",
  );
});

test("setor nulo não enfileira nada, e não quebra", async () => {
  await notifyCycleAvailable(null);
  assert.equal(await prisma.whatsappMessage.count({ where: { user: { username: { contains: MARK } } } }), 0);
});

// ─────────────────────────────────────────────────────────────
// Integração: chegou gente nova no setor
// ─────────────────────────────────────────────────────────────

/** Remetente falso: registra o que sairia, sem WhatsApp nenhum. */
function remetenteFalso() {
  const enviados: string[] = [];
  return {
    enviados,
    sender: async (_jid: string, text: string) => {
      enviados.push(text);
    },
    resolveJid: async (c: string[]) => c[0]!,
  };
}

test("novo integrante: o GESTOR recebe na hora, a equipe fica na fila", async () => {
  const setor = await prisma.sector.findFirst({ select: { id: true } });
  assert.ok(setor, "o seed precisa ter criado setores");

  const gestor = await makeUser("GESTOR", setor.id);
  const colega = await makeUser("COLABORADOR", setor.id);
  const novato = await makeUser("COLABORADOR", setor.id);

  const falso = remetenteFalso();
  const agora = new Date();
  await notifyNewEmployee(
    { userId: novato, fullName: "Maria Silva", role: "COLABORADOR", sectorId: setor.id },
    { ...falso, now: agora },
  );

  const fila = await prisma.whatsappMessage.findMany({
    where: { userId: { in: [gestor, colega, novato] } },
    select: { userId: true, kind: true, status: true, sendAfter: true, text: true },
  });
  const doGestor = fila.find((m) => m.userId === gestor);
  const doColega = fila.find((m) => m.userId === colega);

  assert.ok(doGestor, "o gestor precisa ser avisado");
  assert.equal(doGestor.status, "ENVIADO", "quem planeja o treinamento recebe imediatamente");
  assert.equal(doGestor.kind, "INTEGRACAO");

  assert.ok(doColega, "a equipe também é avisada");
  assert.equal(doColega.status, "PENDENTE", "a equipe sai pela fila, sem rajada");
  assert.ok(
    doColega.sendAfter.getTime() > agora.getTime(),
    "a mensagem da equipe é agendada para depois, não disparada junto",
  );

  assert.ok(
    falso.enviados.some((t) => t.includes("Maria Silva")),
    "a mensagem do gestor nomeia quem chegou",
  );
  assert.ok(
    doColega.text?.includes("Maria Silva"),
    "a mensagem da equipe também nomeia quem chegou",
  );
});

test("novo integrante: o próprio novato não recebe mensagem sobre si", async () => {
  const setor = await prisma.sector.findFirst({ select: { id: true } });
  assert.ok(setor);
  const novato = await makeUser("COLABORADOR", setor.id);

  await notifyNewEmployee(
    { userId: novato, fullName: "Maria Silva", role: "COLABORADOR", sectorId: setor.id },
    remetenteFalso(),
  );

  assert.equal(
    await prisma.whatsappMessage.count({ where: { userId: novato } }),
    0,
    "ninguém é avisado da própria chegada",
  );
});

test("novo integrante: cadastro de ADMIN não manda nada", async () => {
  const setor = await prisma.sector.findFirst({ select: { id: true } });
  assert.ok(setor);
  await makeUser("GESTOR", setor.id);
  const novoAdmin = await makeUser("COLABORADOR", setor.id);

  await notifyNewEmployee(
    { userId: novoAdmin, fullName: "Admin Tecnico", role: "ADMIN", sectorId: setor.id },
    remetenteFalso(),
  );

  assert.equal(
    await prisma.whatsappMessage.count({ where: { user: { username: { contains: MARK } } } }),
    0,
    "conta ADMIN entra em silêncio",
  );
});

test("novo integrante sem setor não manda nada, e não quebra", async () => {
  const novato = await makeUser("COLABORADOR", null);
  await notifyNewEmployee(
    { userId: novato, fullName: "Sem Setor", role: "COLABORADOR", sectorId: null },
    remetenteFalso(),
  );
  assert.equal(
    await prisma.whatsappMessage.count({ where: { user: { username: { contains: MARK } } } }),
    0,
  );
});
