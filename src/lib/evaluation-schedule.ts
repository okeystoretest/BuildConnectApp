import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { notifyCycleAvailable } from "@/lib/whatsapp/notify";
import { addBusinessDays, holidaySet } from "@/lib/business-days";

/**
 * Motor de ciclos do Acompanhamento Pré-Efetivo.
 *
 * Regras (dias úteis, seg–sex; feriados quando a tabela Holiday for populada):
 *  - Ciclo 1: 7 dias úteis após o cadastro do colaborador (User.createdAt).
 *  - Ciclo 2: 7 dias úteis após a CONCLUSÃO do ciclo 1.
 *  - Ciclo 3: 7 dias úteis após a CONCLUSÃO do ciclo 2.
 *
 * Como não há cron garantido na VPS, a liberação é feita por uma varredura
 * idempotente (`sweepAvailability`) chamada:
 *   (a) sob demanda, ao abrir a aba de Avaliações; e
 *   (b) por uma rota /api/cron/evaluations protegida por token, que você pode
 *       plugar num crontab/PM2 quando quiser.
 */

const BUSINESS_DAYS_PER_CYCLE = 7;

async function loadHolidaySet(): Promise<Set<string>> {
  const rows = await prisma.holiday.findMany({ select: { date: true } });
  return holidaySet(rows.map((r: { date: Date }) => r.date));
}

/** Retorna o EvaluationType do Pré-Efetivo (o único com ciclo). */
async function getPreEfetivoType() {
  return prisma.evaluationType.findFirst({ where: { kind: "PRE_EFETIVO" } });
}

/**
 * Garante que o colaborador tenha a agenda de 3 ciclos criada. Idempotente:
 * se já existir, apenas retorna. A âncora é `User.createdAt` (data de cadastro).
 * Apenas o ciclo 1 nasce com `availableAt` calculado; 2 e 3 recebem uma data
 * provisória e são recalculados na conclusão do ciclo anterior.
 */
export async function ensureCycleSchedule(subjectId: string): Promise<void> {
  const type = await getPreEfetivoType();
  if (!type) return;

  const existing = await prisma.evaluationCycle.count({
    where: { subjectId, typeId: type.id },
  });
  if (existing > 0) return;

  const subject = await prisma.user.findUnique({
    where: { id: subjectId },
    select: { createdAt: true, role: true },
  });
  if (!subject) return;

  const holidays = await loadHolidaySet();
  const c1 = addBusinessDays(subject.createdAt, BUSINESS_DAYS_PER_CYCLE, holidays);

  // Ciclos 2 e 3 dependem da conclusão do anterior; guardamos uma projeção
  // a partir do ciclo 1 só para não deixar `availableAt` nulo. Serão
  // recalculados no momento certo (advanceAfterCompletion).
  const c2 = addBusinessDays(c1, BUSINESS_DAYS_PER_CYCLE, holidays);
  const c3 = addBusinessDays(c2, BUSINESS_DAYS_PER_CYCLE, holidays);
  const dates = [c1, c2, c3];

  await prisma.evaluationCycle.createMany({
    data: [1, 2, 3].map((cycle) => ({
      typeId: type.id,
      subjectId,
      cycle,
      // Só o ciclo 1 começa elegível a virar DISPONIVEL; 2 e 3 ficam
      // efetivamente travados até o anterior concluir (ver sweep).
      status: "AGENDADO" as const,
      availableAt: dates[cycle - 1]!,
    })),
    skipDuplicates: true,
  });
}

/**
 * Varredura de liberação. Promove para DISPONIVEL todo ciclo cujo
 * `availableAt` já passou E cujo ciclo anterior (se houver) esteja concluído.
 * Para cada promoção, cria uma notificação persistida ao Gestor do setor do
 * colaborador (uma única vez, via `notifiedAt`).
 *
 * Idempotente e barata: pode ser chamada a cada carga de página.
 * Retorna quantos ciclos foram liberados.
 */
export async function sweepAvailability(now: Date = new Date()): Promise<number> {
  const type = await getPreEfetivoType();
  if (!type) return 0;

  // Candidatos: agendados com data vencida.
  const due = await prisma.evaluationCycle.findMany({
    where: { typeId: type.id, status: "AGENDADO", availableAt: { lte: now } },
    include: {
      subject: {
        select: { id: true, fullName: true, sectorId: true },
      },
    },
  });

  let released = 0;

  for (const cycle of due) {
    // Ciclos 2 e 3 só liberam se o anterior estiver concluído.
    if (cycle.cycle > 1) {
      const prev = await prisma.evaluationCycle.findUnique({
        where: {
          subjectId_typeId_cycle: {
            subjectId: cycle.subjectId,
            typeId: type.id,
            cycle: cycle.cycle - 1,
          },
        },
        select: { status: true },
      });
      if (!prev || prev.status !== "CONCLUIDO") continue;
    }

    const primeiraLiberacao = !cycle.notifiedAt;

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.evaluationCycle.update({
        where: { id: cycle.id },
        data: { status: "DISPONIVEL", notifiedAt: cycle.notifiedAt ?? now },
      });

      // Notifica o Gestor do setor do colaborador (persistido em Notification).
      if (primeiraLiberacao) {
        await notifyManagerOfCycle(tx, {
          subjectName: cycle.subject.fullName,
          sectorId: cycle.subject.sectorId,
          cycle: cycle.cycle,
        });
      }
    });

    // WhatsApp só na PRIMEIRA liberação, e depois do commit. A varredura roda
    // a cada cron: sem esta guarda, o mesmo ciclo viraria uma mensagem por
    // passagem até alguém respondê-lo.
    if (primeiraLiberacao) {
      await notifyCycleAvailable(cycle.subject.sectorId);
    }

    released += 1;
  }

  return released;
}

/**
 * Ao concluir um ciclo, agenda o próximo a partir de agora (+7 dias úteis) e
 * roda uma varredura para liberar imediatamente o que já estiver vencido.
 */
export async function advanceAfterCompletion(
  subjectId: string,
  completedCycle: number,
  completedAt: Date = new Date(),
): Promise<void> {
  const type = await getPreEfetivoType();
  if (!type) return;
  if (completedCycle >= 3) return; // não há ciclo 4

  const holidays = await loadHolidaySet();
  const nextAvailableAt = addBusinessDays(completedAt, BUSINESS_DAYS_PER_CYCLE, holidays);

  await prisma.evaluationCycle.update({
    where: {
      subjectId_typeId_cycle: {
        subjectId,
        typeId: type.id,
        cycle: completedCycle + 1,
      },
    },
    data: { availableAt: nextAvailableAt, status: "AGENDADO" },
  });
}

/**
 * Cria a notificação de ciclo disponível direcionada ao Gestor do setor.
 * A audiência espelha o modelo de Notification (setores destinatários).
 * Buscamos o rótulo do setor para compor a audiência; o(s) Gestor(es)
 * daquele setor recebem via filtro de audiência já existente.
 */
async function notifyManagerOfCycle(
  tx: Prisma.TransactionClient,
  params: { subjectName: string; sectorId: string | null; cycle: number },
): Promise<void> {
  if (!params.sectorId) return;

  const sector = await tx.sector.findUnique({
    where: { id: params.sectorId },
    select: { label: true },
  });
  if (!sector) return;

  await tx.notification.create({
    data: {
      kind: "AVALIACAO",
      title: `Avaliação Pré-Efetivo disponível — ciclo ${params.cycle}`,
      body: `O ${params.cycle}º ciclo de ${params.subjectName} está liberado para preenchimento.`,
      href: "/setores/rh",
      // Setor do colaborador: o Gestor lotado nele recebe.
      audience: [sector.label],
    },
  });
}
