import { prisma } from "@/lib/db/prisma";
import { can } from "@/lib/permissions";
import {
  contarEntregas,
  estaAtrasado,
  mediaDasSemanas,
  resumirKanban,
} from "./math";
import type { Role } from "@/types";
import type {
  MarketingTaskItem,
  WeeklyReportData,
  WeeklyReportDetail,
  WeeklyReportListItem,
} from "@/types/weekly-report";

/**
 * Leitura do Relatório Semanal.
 *
 * O escopo é o SUBSETOR pelo slug, direto — sem `resolveAppScope`. Marketing
 * herda os aplicativos e o cronograma de Vendas, mas não o relatório: ele é
 * da área que o preenche e do gestor que o aprova (ver o comentário do modelo
 * no schema).
 */

/** `@db.Date` do Prisma → "yyyy-mm-dd". */
function isoDia(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** Hoje em "yyyy-mm-dd", em UTC — a mesma régua das colunas `@db.Date`. */
export function hojeIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Resolve o subsetor e confirma que a ferramenta está habilitada nele. */
export async function resolveWeeklyScope(slug: string) {
  const sub = await prisma.subsector.findUnique({
    where: { slug },
    select: { id: true, slug: true, label: true, weeklyReportEnabled: true },
  });
  if (!sub || !sub.weeklyReportEnabled) return null;
  return sub;
}

function toTask(row: {
  id: string;
  code: string;
  title: string;
  category: MarketingTaskItem["category"];
  priority: MarketingTaskItem["priority"];
  assignee: { id: string; fullName: string; avatarPath: string | null } | null;
  enteredAt: Date;
  dueDate: Date | null;
  status: MarketingTaskItem["status"];
  evidence: string | null;
  note: string | null;
  doneAt: Date | null;
}): MarketingTaskItem {
  const task = {
    id: row.id,
    code: row.code,
    title: row.title,
    category: row.category,
    priority: row.priority,
    assignee: row.assignee
      ? {
          id: row.assignee.id,
          name: row.assignee.fullName,
          avatarPath: row.assignee.avatarPath ?? undefined,
        }
      : undefined,
    enteredAt: isoDia(row.enteredAt),
    dueDate: row.dueDate ? isoDia(row.dueDate) : undefined,
    status: row.status,
    evidence: row.evidence ?? undefined,
    note: row.note ?? undefined,
    doneAt: row.doneAt?.toISOString(),
    overdue: false,
  };
  return { ...task, overdue: estaAtrasado(task, hojeIso()) };
}

export async function getWeeklyReportData(
  slug: string,
  role: Role,
): Promise<WeeklyReportData | null> {
  const scope = await resolveWeeklyScope(slug);
  if (!scope) return null;

  const [reportRows, taskRows, peopleRows] = await Promise.all([
    prisma.weeklyReport.findMany({
      where: { subsectorId: scope.id },
      orderBy: { periodStart: "desc" },
      select: {
        id: true,
        weekNumber: true,
        periodStart: true,
        periodEnd: true,
        status: true,
        submittedAt: true,
        approvedAt: true,
        createdBy: { select: { fullName: true } },
        approvedBy: { select: { fullName: true } },
        // Só a saúde: o card mostra os três contadores do rodapé da aba 2, e
        // trazer evidência e observação de 22 linhas por semana para montar
        // uma contagem seria carregar o relatório inteiro para desenhar um
        // card.
        deliveries: { select: { health: true } },
      },
    }),
    prisma.marketingTask.findMany({
      where: { subsectorId: scope.id },
      orderBy: [{ status: "asc" }, { priority: "asc" }, { code: "asc" }],
      select: {
        id: true,
        code: true,
        title: true,
        category: true,
        priority: true,
        assignee: { select: { id: true, fullName: true, avatarPath: true } },
        enteredAt: true,
        dueDate: true,
        status: true,
        evidence: true,
        note: true,
        doneAt: true,
      },
    }),
    // Quem pode ser responsável: só quem está lotado NESTE subsetor. A lista
    // do seletor é a mesma que a action confere ao gravar — se fosse a
    // empresa inteira, um cartão do Marketing poderia cair no nome de alguém
    // da Logística.
    prisma.user.findMany({
      where: { active: true, subsectors: { some: { subsectorId: scope.id } } },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true, avatarPath: true },
    }),
  ]);

  const reports: WeeklyReportListItem[] = reportRows.map((row) => ({
    id: row.id,
    weekNumber: row.weekNumber,
    periodStart: isoDia(row.periodStart),
    periodEnd: isoDia(row.periodEnd),
    status: row.status,
    submittedAt: row.submittedAt?.toISOString(),
    approvedAt: row.approvedAt?.toISOString(),
    authorName: row.createdBy?.fullName,
    approverName: row.approvedBy?.fullName,
    ...contarEntregas(row.deliveries),
  }));

  const tasks = taskRows.map(toTask);

  return {
    slug: scope.slug,
    sectorLabel: scope.label,
    // Preencher o relatório e mover cartões é o trabalho da área: basta ter
    // acesso ao setor. O que é de gestão é APROVAR a semana.
    canEdit: true,
    canApprove: can(role, "weeklyReport.approve"),
    reports,
    tasks,
    summary: resumirKanban(tasks),
    people: peopleRows.map((p) => ({
      id: p.id,
      name: p.fullName,
      avatarPath: p.avatarPath ?? undefined,
    })),
  };
}

export async function getWeeklyReportDetail(
  slug: string,
  reportId: string,
  role: Role,
): Promise<WeeklyReportDetail | null> {
  const scope = await resolveWeeklyScope(slug);
  if (!scope) return null;

  const row = await prisma.weeklyReport.findFirst({
    // O subsetor no WHERE é o que impede abrir o relatório de outra área por
    // id colado na URL.
    where: { id: reportId, subsectorId: scope.id },
    select: {
      id: true,
      weekNumber: true,
      periodStart: true,
      periodEnd: true,
      status: true,
      highlight: true,
      learning: true,
      nextPriority: true,
      submittedAt: true,
      approvedAt: true,
      createdBy: { select: { fullName: true } },
      approvedBy: { select: { fullName: true } },
      deliveries: { orderBy: { order: "asc" } },
      metrics: { orderBy: { order: "asc" } },
      okrs: { orderBy: { order: "asc" } },
      blockers: { orderBy: { order: "asc" } },
      agenda: { orderBy: { order: "asc" } },
    },
  });
  if (!row) return null;

  const canApprove = can(role, "weeklyReport.approve");

  // Média de 4 semanas (o K2 da aba "OKRs Semanais"): as três semanas
  // anteriores mais esta, casando os KRs pelo TEXTO do resultado-chave.
  //
  // Pelo texto, e não por id, porque cada relatório tem as suas próprias
  // linhas de OKR — é o que preserva a história quando o modelo muda. O preço
  // é que renomear um KR reinicia a média dele, e isso é o certo: um KR
  // renomeado mede outra coisa.
  const anteriores = await prisma.weeklyReport.findMany({
    where: { subsectorId: scope.id, periodStart: { lt: row.periodStart } },
    orderBy: { periodStart: "desc" },
    take: 3,
    select: { okrs: { select: { keyResult: true, achieved: true } } },
  });
  const historico = new Map<string, (number | undefined)[]>();
  for (const okr of row.okrs) {
    historico.set(okr.keyResult, [okr.achieved ?? undefined]);
  }
  for (const anterior of anteriores) {
    for (const okr of anterior.okrs) {
      historico.get(okr.keyResult)?.push(okr.achieved ?? undefined);
    }
  }

  return {
    id: row.id,
    weekNumber: row.weekNumber,
    periodStart: isoDia(row.periodStart),
    periodEnd: isoDia(row.periodEnd),
    status: row.status,
    submittedAt: row.submittedAt?.toISOString(),
    approvedAt: row.approvedAt?.toISOString(),
    authorName: row.createdBy?.fullName,
    approverName: row.approvedBy?.fullName,
    ...contarEntregas(row.deliveries),
    highlight: row.highlight ?? undefined,
    learning: row.learning ?? undefined,
    nextPriority: row.nextPriority ?? undefined,
    deliveries: row.deliveries.map((d) => ({
      id: d.id,
      order: d.order,
      day: d.day,
      block: d.block,
      expected: d.expected,
      health: d.health ?? undefined,
      evidence: d.evidence ?? undefined,
      note: d.note ?? undefined,
    })),
    metrics: row.metrics.map((m) => ({
      id: m.id,
      order: m.order,
      channel: m.channel,
      metric: m.metric,
      previous: m.previous ?? undefined,
      current: m.current ?? undefined,
      target: m.target ?? undefined,
      health: m.health ?? undefined,
      reading: m.reading ?? undefined,
    })),
    okrs: row.okrs.map((o) => ({
      id: o.id,
      order: o.order,
      objective: o.objective,
      keyResult: o.keyResult,
      measure: o.measure,
      goalLabel: o.goalLabel,
      goalValue: o.goalValue ?? undefined,
      achieved: o.achieved ?? undefined,
      monthlyRead: o.monthlyRead,
      health: o.health ?? undefined,
      nextStep: o.nextStep ?? undefined,
      fourWeekAverage: mediaDasSemanas(historico.get(o.keyResult) ?? []),
    })),
    blockers: row.blockers.map((b) => ({
      id: b.id,
      order: b.order,
      title: b.title,
      impact: b.impact ?? undefined,
      needs: b.needs ?? undefined,
      dueDate: b.dueDate ? isoDia(b.dueDate) : undefined,
      health: b.health ?? undefined,
      resolution: b.resolution ?? undefined,
    })),
    agenda: row.agenda.map((a) => ({
      id: a.id,
      order: a.order,
      block: a.block,
      minutes: a.minutes,
      question: a.question,
      answer: a.answer ?? undefined,
    })),
    // Relatório aprovado fecha para edição — quem reabre é a gestão. Sem
    // isso, o número que fundamentou a aprovação muda depois dela, e a
    // aprovação deixa de significar algo.
    canEdit: row.status !== "APROVADO" || canApprove,
    canApprove,
  };
}
