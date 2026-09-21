import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { prisma } from "@/lib/db/prisma";
import { ensureCycleSchedule, sweepAvailability } from "./evaluation-schedule";
import { PRE_EFETIVO_CUTOFF } from "./pre-efetivo-cutoff";

/**
 * Agenda do Pré-Efetivo contra o Postgres: quem espera e quem abre na hora.
 * Depende do instrumento PRE_EFETIVO semeado (npm run db:seed).
 */

const MARK = "#PRECYCLE";
const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

let sectorId = "";
let typeId = "";

async function makeColab(createdAt: Date): Promise<string> {
  const u = await prisma.user.create({
    data: {
      username: `pc-${stamp()}${MARK}`,
      fullName: `Pessoa ${MARK}`,
      passwordHash: "x",
      role: "COLABORADOR",
      sectorId,
      createdAt,
    },
    select: { id: true },
  });
  return u.id;
}

before(async () => {
  const type = await prisma.evaluationType.findFirst({ where: { kind: "PRE_EFETIVO" } });
  assert.ok(type, "instrumento PRE_EFETIVO precisa estar semeado");
  typeId = type.id;
  const sector = await prisma.sector.create({
    data: { slug: `setor-${stamp()}${MARK}`, label: "Setor", icon: "Box" },
    select: { id: true },
  });
  sectorId = sector.id;
});

after(async () => {
  await prisma.notification.deleteMany({ where: { body: { contains: MARK } } });
  await prisma.user.deleteMany({ where: { username: { contains: MARK } } });
  await prisma.sector.deleteMany({ where: { id: sectorId } });
});

test("cadastrado a partir do corte: ciclo 1 AGENDADO para depois do cadastro (onboarding)", async () => {
  const createdAt = new Date(PRE_EFETIVO_CUTOFF.getTime() + 24 * 3600 * 1000);
  const id = await makeColab(createdAt);
  await ensureCycleSchedule(id);

  const cycles = await prisma.evaluationCycle.findMany({
    where: { subjectId: id, typeId },
    orderBy: { cycle: "asc" },
  });
  assert.equal(cycles.length, 3);
  assert.equal(cycles[0]!.status, "AGENDADO");
  assert.ok(cycles[0]!.availableAt.getTime() > createdAt.getTime());
});

test("cadastrado antes do corte: ciclo 1 DISPONIVEL na hora, ciclos 2 e 3 AGENDADOS", async () => {
  const id = await makeColab(new Date("2025-03-10T12:00:00Z"));
  const antes = Date.now();
  await ensureCycleSchedule(id);

  const cycles = await prisma.evaluationCycle.findMany({
    where: { subjectId: id, typeId },
    orderBy: { cycle: "asc" },
  });
  assert.equal(cycles.length, 3);
  assert.equal(cycles[0]!.status, "DISPONIVEL");
  assert.ok(cycles[0]!.availableAt.getTime() <= Date.now());
  assert.ok(cycles[0]!.availableAt.getTime() >= antes - 1000);
  assert.equal(cycles[1]!.status, "AGENDADO");
  assert.equal(cycles[2]!.status, "AGENDADO");
});

test("cadastrado antes do corte: ciclo 1 imediato não gera aviso ao gestor", async () => {
  const id = await makeColab(new Date("2025-03-10T12:00:00Z"));
  await ensureCycleSchedule(id);
  await sweepAvailability();

  const c1 = await prisma.evaluationCycle.findUnique({
    where: { subjectId_typeId_cycle: { subjectId: id, typeId, cycle: 1 } },
  });
  assert.ok(c1!.notifiedAt, "ciclo 1 marcado como já avisado para a varredura não repetir");
  const avisos = await prisma.notification.count({
    where: { body: { contains: MARK }, kind: "AVALIACAO" },
  });
  assert.equal(avisos, 0);
});

test("ensureCycleSchedule é idempotente", async () => {
  const id = await makeColab(new Date("2025-03-10T12:00:00Z"));
  await ensureCycleSchedule(id);
  await ensureCycleSchedule(id);
  assert.equal(await prisma.evaluationCycle.count({ where: { subjectId: id, typeId } }), 3);
});
