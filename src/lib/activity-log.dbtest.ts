import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { prisma } from "@/lib/db/prisma";
import { recordActivity } from "./activity-log";

/**
 * A gravação do log de entrada/saída, contra o Postgres.
 *
 * O teste que importa é o terceiro: gravar log não pode derrubar a ação. Se
 * uma falha de escrita aqui propagar, ninguém consegue entrar na plataforma.
 */

const MARK = "#ACTLOG";
const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

let userId = "";

before(async () => {
  const u = await prisma.user.create({
    data: {
      username: `actlog-${stamp()}${MARK}`,
      fullName: `Registrado ${MARK}`,
      passwordHash: "x",
      role: "COLABORADOR",
    },
    select: { id: true },
  });
  userId = u.id;
});

after(async () => {
  await prisma.activityEvent.deleteMany({ where: { userId } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.$disconnect();
});

test("grava o login com a data do momento", async () => {
  await recordActivity(userId, "LOGIN");
  const rows = await prisma.activityEvent.findMany({ where: { userId } });
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.kind, "LOGIN");
  assert.ok(rows[0]?.occurredAt instanceof Date);
});

test("grava o logout como evento separado", async () => {
  await recordActivity(userId, "LOGOUT");
  const rows = await prisma.activityEvent.findMany({ where: { userId } });
  assert.equal(rows.length, 2);
  assert.ok(rows.some((r) => r.kind === "LOGOUT"));
});

test("usuário inexistente não derruba a ação — só registra no console", async () => {
  // A chave estrangeira recusa a escrita. `recordActivity` tem de absorver.
  await assert.doesNotReject(() => recordActivity("nao-existe-este-id", "LOGIN"));
});

test("o log de uma pessoa não aparece no de outra", async () => {
  const outro = await prisma.user.create({
    data: {
      username: `actlog2-${stamp()}${MARK}`,
      fullName: `Outro ${MARK}`,
      passwordHash: "x",
      role: "COLABORADOR",
    },
    select: { id: true },
  });
  await recordActivity(outro.id, "LOGIN");

  const meus = await prisma.activityEvent.findMany({ where: { userId } });
  assert.ok(!meus.some((r) => r.userId === outro.id));

  await prisma.activityEvent.deleteMany({ where: { userId: outro.id } });
  await prisma.user.deleteMany({ where: { id: outro.id } });
});
