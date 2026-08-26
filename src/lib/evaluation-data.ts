import { prisma } from "@/lib/db/prisma";
import { sweepAvailability } from "@/lib/evaluation-schedule";
import { MULTI_RATER_SLUGS } from "@/lib/evaluation-rounds-config";
import type {
  EvalForm,
  EvaluationTypeCard,
  PendingEvaluation,
  SubjectCycles,
  EvaluationResultAnswer,
  EvaluationResultDetail,
  EvaluationResultEntry,
  EvaluationResultSection,
  EvaluationResultSubject,
  EvaluationResultTypeCard,
  EvaluationKind,
  EvaluationSubject,
  EfficacyRoundStatus,
} from "@/types/evaluation";

/**
 * A VPS roda em UTC. Sem fixar o fuso, o carimbo de hora exibido na aba de
 * Resultados sairia 3 horas adiantado para quem opera no Brasil.
 */
const TZ = "America/Sao_Paulo";

function fmtDate(date: Date): string {
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: TZ,
  });
}

/** Horário de finalização (carimbo exigido na aba de Resultados). */
function fmtTime(date: Date): string {
  return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
}

function fmtStamp(date: Date): string {
  return `${fmtDate(date)} às ${fmtTime(date)}`;
}

/** Cards da aba Avaliações, com a contagem de submissões concluídas. */
/**
 * Colaboradores selecionáveis como avaliado. Escopo:
 *  - Admin (sectors = null): todos os colaboradores ativos.
 *  - Gestor: apenas colaboradores (role COLABORADOR) do(s) setor(es) dele.
 * Gestores/Admins não entram como avaliados — só colaboradores.
 */
export async function getEvaluationSubjects(
  sectors?: string[] | null,
): Promise<EvaluationSubject[]> {
  const users = await prisma.user.findMany({
    where: {
      active: true,
      role: "COLABORADOR",
      ...(sectors && sectors.length > 0 ? { sector: { label: { in: sectors } } } : {}),
    },
    select: { id: true, fullName: true, sector: { select: { label: true } } },
    orderBy: { fullName: "asc" },
  });

  return users.map((u: { id: string; fullName: string; sector: { label: string } | null }) => ({
    id: u.id,
    name: u.fullName,
    sector: u.sector?.label ?? "—",
  }));
}

/** Carrega todos os formulários (5), indexados por slug. */
export async function getAllForms(): Promise<Record<string, EvalForm>> {
  const types = await prisma.evaluationType.findMany({ select: { slug: true } });
  const forms: Record<string, EvalForm> = {};
  for (const t of types as { slug: string }[]) {
    const form = await getEvaluationForm(t.slug);
    if (form) forms[t.slug] = form;
  }
  return forms;
}

export async function getEvaluationTypeCards(): Promise<EvaluationTypeCard[]> {
  const types = await prisma.evaluationType.findMany({
    orderBy: { order: "asc" },
    include: { _count: { select: { evaluations: true } } },
  });

  return types.map((t: {
    id: string; slug: string; kind: EvaluationKind; title: string; hasCycle: boolean;
    _count: { evaluations: number };
  }) => ({
    id: t.id,
    slug: t.slug,
    kind: t.kind,
    title: t.title,
    hasCycle: t.hasCycle,
    count: t._count.evaluations,
  }));
}

/** Definição do formulário (seções + perguntas) para renderizar/paginar. */
export async function getEvaluationForm(slug: string): Promise<EvalForm | null> {
  const type = await prisma.evaluationType.findUnique({
    where: { slug },
    include: {
      sections: {
        orderBy: { order: "asc" },
        include: { questions: { orderBy: { order: "asc" } } },
      },
    },
  });
  if (!type) return null;

  return {
    id: type.id,
    slug: type.slug,
    kind: type.kind,
    title: type.title,
    description: type.description ?? undefined,
    scaleMax: type.scaleMax,
    scaleLabels: type.scaleLabels ?? [],
    hasCycle: type.hasCycle,
    sections: type.sections.map((s: {
      id: string; title: string;
      questions: { id: string; label: string; helpText: string | null }[];
    }) => ({
      id: s.id,
      title: s.title,
      questions: s.questions.map((q) => ({
        id: q.id,
        label: q.label,
        helpText: q.helpText ?? undefined,
      })),
    })),
  };
}

/**
 * Fila de ciclos do Pré-Efetivo disponíveis para preenchimento. Roda a
 * varredura de liberação antes de ler (efeito on-demand). Opcionalmente
 * filtra por setores (para o Gestor ver só o seu).
 */
export async function getPendingEvaluations(
  sectors?: string[] | null,
): Promise<PendingEvaluation[]> {
  await sweepAvailability();

  const cycles = await prisma.evaluationCycle.findMany({
    where: {
      status: "DISPONIVEL",
      ...(sectors && sectors.length > 0
        ? { subject: { sector: { label: { in: sectors } } } }
        : {}),
    },
    orderBy: [{ availableAt: "asc" }],
    include: {
      type: { select: { id: true, slug: true, title: true } },
      subject: { select: { id: true, fullName: true, sector: { select: { label: true } } } },
    },
  });

  return cycles.map((c: {
    cycle: number; availableAt: Date;
    type: { id: string; slug: string; title: string };
    subject: { id: string; fullName: string; sector: { label: string } | null };
  }) => ({
    subjectId: c.subject.id,
    subjectName: c.subject.fullName,
    sector: c.subject.sector?.label ?? "—",
    typeId: c.type.id,
    typeSlug: c.type.slug,
    typeTitle: c.type.title,
    cycle: c.cycle,
    availableAtLabel: fmtDate(c.availableAt),
  }));
}

/** Agenda completa de ciclos por colaborador (visão do Pré-Efetivo). */
export async function getSubjectCycles(sectors?: string[] | null): Promise<SubjectCycles[]> {
  await sweepAvailability();

  const subjects = await prisma.user.findMany({
    where: {
      active: true,
      evaluationCycles: { some: {} },
      ...(sectors && sectors.length > 0 ? { sector: { label: { in: sectors } } } : {}),
    },
    select: {
      id: true,
      fullName: true,
      createdAt: true,
      sector: { select: { label: true } },
      evaluationCycles: {
        orderBy: { cycle: "asc" },
        select: { cycle: true, status: true, availableAt: true, completedAt: true },
      },
    },
    orderBy: { fullName: "asc" },
  });

  return subjects.map((s: {
    id: string; fullName: string; createdAt: Date; sector: { label: string } | null;
    evaluationCycles: { cycle: number; status: string; availableAt: Date; completedAt: Date | null }[];
  }) => ({
    subjectId: s.id,
    subjectName: s.fullName,
    sector: s.sector?.label ?? "—",
    admittedAtLabel: fmtDate(s.createdAt),
    cycles: s.evaluationCycles.map((c) => ({
      cycle: c.cycle,
      status: c.status as SubjectCycles["cycles"][number]["status"],
      availableAt: c.availableAt.toISOString(),
      completedAt: c.completedAt?.toISOString(),
    })),
  }));
}


// ─────────────────────────────────────────────────────────────
// Resultados de Avaliação — catálogo em 3 níveis
// ─────────────────────────────────────────────────────────────
//
// Nível 1: cards dos instrumentos.
// Nível 2: colaboradores avaliados naquele instrumento.
// Nível 3: o resultado em si (uma submissão ou uma rodada consolidada).
//
// Instrumentos multidirecionais (Matriz de Decisão / Eficácia) aparecem como
// RODADAS; os demais, como submissões avulsas. Um mesmo instrumento pode ter
// as duas coisas (uma Matriz preenchida direto no setor, por exemplo), então
// as entradas são uma união discriminada por `mode`.

interface DatedEntry {
  at: number;
  entry: EvaluationResultEntry;
}

/**
 * Catálogo completo dos resultados, já agrupado por instrumento e por
 * colaborador. Escopo opcional por setor (Gestor vê só o próprio).
 */
export async function getEvaluationResultsCatalog(
  sectors?: string[] | null,
): Promise<EvaluationResultTypeCard[]> {
  const scoped = sectors && sectors.length > 0;
  const subjectFilter = scoped ? { subject: { sector: { label: { in: sectors } } } } : {};

  const [types, evaluations, rounds] = await Promise.all([
    prisma.evaluationType.findMany({ orderBy: { order: "asc" } }),
    // Submissões avulsas: as que pertencem a uma rodada são lidas via rodada.
    prisma.evaluation.findMany({
      where: { status: "CONCLUIDA", roundId: null, ...subjectFilter },
      orderBy: { createdAt: "desc" },
      include: {
        type: { select: { id: true, scaleMax: true } },
        subject: { select: { id: true, fullName: true, sector: { select: { label: true } } } },
        evaluator: { select: { fullName: true } },
        _count: { select: { answers: true } },
      },
    }),
    prisma.evaluationRound.findMany({
      where: { ...subjectFilter },
      orderBy: { createdAt: "desc" },
      include: {
        subject: { select: { id: true, fullName: true, sector: { select: { label: true } } } },
        _count: { select: { evaluations: { where: { isSelfAssessment: false } } } },
      },
    }),
  ]);

  // typeId → subjectId → entradas datadas.
  const buckets = new Map<string, Map<string, { subject: EvaluationResultSubject; dated: DatedEntry[] }>>();

  function bucket(
    typeId: string,
    subject: { id: string; fullName: string; sector: { label: string } | null },
  ) {
    let bySubject = buckets.get(typeId);
    if (!bySubject) {
      bySubject = new Map();
      buckets.set(typeId, bySubject);
    }
    let slot = bySubject.get(subject.id);
    if (!slot) {
      slot = {
        subject: {
          subjectId: subject.id,
          subjectName: subject.fullName,
          sector: subject.sector?.label ?? "—",
          entries: [],
          lastLabel: "—",
        },
        dated: [],
      };
      bySubject.set(subject.id, slot);
    }
    return slot;
  }

  for (const e of evaluations) {
    const slot = bucket(e.type.id, e.subject);
    slot.dated.push({
      at: e.createdAt.getTime(),
      entry: {
        mode: "SIMPLES",
        id: e.id,
        cycle: e.cycle ?? undefined,
        total: e.total ?? 0,
        maxTotal: e._count.answers * e.type.scaleMax,
        evaluatorName: e.evaluator?.fullName ?? undefined,
        finishedAtLabel: fmtDate(e.createdAt),
        finishedAtTimeLabel: fmtTime(e.createdAt),
      },
    });
  }

  for (const r of rounds) {
    const slot = bucket(r.typeId, r.subject);
    const done = r.completedAt ?? null;
    slot.dated.push({
      at: (done ?? r.createdAt).getTime(),
      entry: {
        mode: "MULTI",
        id: r.id,
        status: r.status as EfficacyRoundStatus,
        raterQuota: r.raterQuota,
        feedbackDone: r._count.evaluations,
        selfDone: r.status === "CONCLUIDA",
        startedAtLabel: fmtDate(r.createdAt),
        finishedAtLabel: done ? fmtDate(done) : undefined,
        finishedAtTimeLabel: done ? fmtTime(done) : undefined,
      },
    });
  }

  return types.map((t): EvaluationResultTypeCard => {
    const bySubject = buckets.get(t.id);
    const subjects: EvaluationResultSubject[] = [];
    let count = 0;

    if (bySubject) {
      for (const slot of bySubject.values()) {
        slot.dated.sort((a, b) => b.at - a.at);
        const newest = slot.dated[0];
        subjects.push({
          ...slot.subject,
          entries: slot.dated.map((d) => d.entry),
          lastLabel: newest ? fmtStamp(new Date(newest.at)) : "—",
        });
        count += slot.dated.length;
      }
      subjects.sort((a, b) => a.subjectName.localeCompare(b.subjectName, "pt-BR"));
    }

    return {
      typeId: t.id,
      slug: t.slug,
      kind: t.kind as EvaluationKind,
      title: t.title,
      multiRater: MULTI_RATER_SLUGS.includes(t.slug),
      count,
      subjects,
    };
  });
}

/**
 * Detalhe de uma submissão, já agrupado por seção e com os rótulos da escala
 * resolvidos. É o que a tela cheia de resultado consome.
 */
export async function getEvaluationDetail(id: string): Promise<EvaluationResultDetail | null> {
  const e = await prisma.evaluation.findUnique({
    where: { id },
    include: {
      type: { select: { title: true, slug: true, kind: true, scaleMax: true, scaleLabels: true } },
      subject: { select: { fullName: true, sector: { select: { label: true } } } },
      evaluator: { select: { fullName: true } },
      answers: {
        include: {
          question: {
            select: {
              label: true,
              helpText: true,
              order: true,
              section: { select: { id: true, title: true, order: true } },
            },
          },
        },
      },
    },
  });
  if (!e) return null;

  const scaleLabels = e.type.scaleLabels ?? [];
  const labelOf = (value: number): string => scaleLabels[value - 1] ?? String(value);

  // Agrupa por seção preservando a ordem cadastrada no instrumento.
  const bySection = new Map<
    string,
    { order: number; title: string; rows: { order: number; answer: EvaluationResultAnswer }[] }
  >();

  for (const a of e.answers) {
    const s = a.question.section;
    let group = bySection.get(s.id);
    if (!group) {
      group = { order: s.order, title: s.title, rows: [] };
      bySection.set(s.id, group);
    }
    group.rows.push({
      order: a.question.order,
      answer: {
        label: a.question.label,
        helpText: a.question.helpText ?? undefined,
        value: a.value,
        valueLabel: labelOf(a.value),
      },
    });
  }

  const sections: EvaluationResultSection[] = Array.from(bySection.values())
    .sort((x, y) => x.order - y.order)
    .map((g) => {
      const answers = g.rows.sort((x, y) => x.order - y.order).map((r) => r.answer);
      const total = answers.reduce((sum, a) => sum + a.value, 0);
      return { title: g.title, answers, total, maxTotal: answers.length * e.type.scaleMax };
    });

  const answerCount = sections.reduce((n, s) => n + s.answers.length, 0);

  return {
    id: e.id,
    typeTitle: e.type.title,
    typeSlug: e.type.slug,
    kind: e.type.kind as EvaluationKind,
    subjectName: e.subject.fullName,
    subjectSector: e.subject.sector?.label ?? "—",
    evaluatorName: e.evaluator?.fullName ?? undefined,
    cycle: e.cycle ?? undefined,
    total: e.total ?? 0,
    maxTotal: answerCount * e.type.scaleMax,
    scaleMax: e.type.scaleMax,
    scaleLabels,
    observations: e.observations ?? undefined,
    finishedAtLabel: fmtDate(e.createdAt),
    finishedAtTimeLabel: fmtTime(e.createdAt),
    sections,
  };
}
