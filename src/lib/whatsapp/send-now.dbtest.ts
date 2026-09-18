import assert from "node:assert/strict";
import test, { after, before, beforeEach } from "node:test";
import { prisma } from "@/lib/db/prisma";
import { drainOutbox, sendNow } from "./outbox";
import { notifyNewItTicket } from "./notify";
import { MESSAGE_TEXT, ticketText } from "./messages";

/**
 * Envio imediato, fora da fila — o caminho do chamado de TI.
 *
 * Diferente da fila, aqui não há sorteio nem espera: o envio acontece na hora,
 * e a linha em `WhatsappMessage` nasce já com o resultado. O que não muda é o
 * registro por destinatário — a auditoria é a mesma.
 */

const MARK = "#WASENDNOW";
const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const AGORA = new Date("2030-02-01T12:00:00Z");

let sectorId = "";
let tiSlug = "";

async function makeUser(phone: string | null, sector: string | null = null): Promise<string> {
  const u = await prisma.user.create({
    data: {
      username: `sn-${stamp()}${MARK}`,
      fullName: `Destinatário ${MARK}`,
      passwordHash: "x",
      role: "COLABORADOR",
      phone,
      sectorId: sector,
    },
    select: { id: true },
  });
  return u.id;
}

async function limpar() {
  await prisma.whatsappMessage.deleteMany({ where: { user: { username: { contains: MARK } } } });
  await prisma.user.deleteMany({ where: { username: { contains: MARK } } });
}

before(async () => {
  const sector = await prisma.sector.create({
    data: { slug: `retag-${stamp()}${MARK}`, label: "Retaguarda (teste)", icon: "Box" },
    select: { id: true },
  });
  sectorId = sector.id;
  tiSlug = `ti-${stamp()}${MARK}`;
  await prisma.subsector.create({ data: { slug: tiSlug, label: "TI (teste)", icon: "Box", sectorId } });
});
beforeEach(limpar);
after(async () => {
  await limpar();
  await prisma.sector.deleteMany({ where: { id: sectorId } });
  await prisma.$disconnect();
});

test("sendNow envia na hora e grava ENVIADO com o texto próprio", async () => {
  const a = await makeUser("11987654321");
  const enviados: Array<{ jid: string; text: string }> = [];

  const r = await sendNow([a], "CHAMADO_TI", "Texto do chamado", {
    now: AGORA,
    resolveJid: async (c) => c[0]!,
    sender: async (jid, text) => {
      enviados.push({ jid, text });
    },
  });

  assert.deepEqual(r, { enviados: 1, falhas: 0 });
  assert.equal(enviados.length, 1);
  assert.equal(enviados[0]!.text, "Texto do chamado");
  const row = await prisma.whatsappMessage.findFirst({ where: { userId: a } });
  assert.equal(row?.status, "ENVIADO");
  assert.equal(row?.text, "Texto do chamado");
  assert.equal(row?.attempts, 1);
});

test("sendNow: falha de um destinatário não impede os demais; sem telefone falha de vez", async () => {
  const semFone = await makeUser(null);
  const ok = await makeUser("11987654322");
  const r = await sendNow([semFone, ok], "CHAMADO_TI", "T", {
    now: AGORA,
    resolveJid: async (c) => c[0]!,
    sender: async () => {},
  });
  assert.deepEqual(r, { enviados: 1, falhas: 1 });
  const rows = await prisma.whatsappMessage.findMany({ where: { userId: { in: [semFone, ok] } } });
  assert.equal(rows.find((m) => m.userId === semFone)?.status, "FALHOU");
  assert.equal(rows.find((m) => m.userId === ok)?.status, "ENVIADO");
});

test("sendNow: falha passageira fica PENDENTE para a fila repescar", async () => {
  const a = await makeUser("11987654323");
  const r = await sendNow([a], "CHAMADO_TI", "T", {
    now: AGORA,
    resolveJid: async (c) => c[0]!,
    sender: async () => {
      throw new Error("queda de rede");
    },
  });
  assert.deepEqual(r, { enviados: 0, falhas: 0 });
  const row = await prisma.whatsappMessage.findFirst({ where: { userId: a } });
  assert.equal(row?.status, "PENDENTE");
  assert.equal(row?.attempts, 1);
});

test("a drenagem usa o texto próprio da mensagem quando existe", async () => {
  const a = await makeUser("11987654324");
  await prisma.whatsappMessage.create({
    data: { userId: a, kind: "CHAMADO_TI", text: "Próprio", sendAfter: AGORA },
  });
  const textos: string[] = [];
  await drainOutbox({
    now: AGORA,
    delayMs: () => 0,
    resolveJid: async (c) => c[0]!,
    sender: async (_jid, text) => {
      textos.push(text);
    },
  });
  assert.deepEqual(textos, ["Próprio"]);
  assert.notEqual(MESSAGE_TEXT.CHAMADO_TI, "Próprio");
});

test("ticketText leva o código e o link da Retaguarda", () => {
  const t = ticketText("TI-0042");
  assert.match(t, /TI-0042/);
  assert.match(t, /buildconnectapp\.com\.br\/setores\/ti/);
});

test("notifyNewItTicket manda para todo usuário ativo lotado no subsetor, e só", async () => {
  const dentro = await makeUser("11987654325", sectorId);
  const fora = await makeUser("11987654326", null);
  const inativo = await makeUser("11987654327", sectorId);
  await prisma.user.update({ where: { id: inativo }, data: { active: false } });

  const enviados: string[] = [];
  await notifyNewItTicket("TI-0007", {
    slug: tiSlug,
    now: AGORA,
    resolveJid: async (c) => c[0]!,
    sender: async (_jid, text) => {
      enviados.push(text);
    },
  });

  const rows = await prisma.whatsappMessage.findMany({
    where: { userId: { in: [dentro, fora, inativo] } },
    select: { userId: true, status: true },
  });
  assert.deepEqual(rows.map((r) => r.userId), [dentro]);
  assert.equal(rows[0]!.status, "ENVIADO");
  assert.equal(enviados.length, 1);
  assert.match(enviados[0]!, /TI-0007/);
});
