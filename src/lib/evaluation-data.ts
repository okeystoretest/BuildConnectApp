import { prisma } from "@/lib/db/prisma";
import { sweepAvailability } from "@/lib/evaluation-schedule";
import type {
  EvalForm,
  EvaluationTypeCard,
  PendingEvaluation,
  SubjectCycles,
  EvaluationResultGroup,
  EvaluationResultDetail,
  EvaluationKind,
  EvaluationSubject,
} from "@/types/evaluation";

function fmtDate(date: Date): string {
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
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

/** Resultados agrupados por colaborador (aba Resultados de Avaliações). */
export async function getEvaluationResults(
  sectors?: string[] | null,
): Promise<EvaluationResultGroup[]> {
  const evaluations = await prisma.evaluation.findMany({
    where: {
      status: "CONCLUIDA",
      ...(sectors && sectors.length > 0
        ? { subject: { sector: { label: { in: sectors } } } }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    include: {
      type: { select: { title: true, kind: true, scaleMax: true } },
      subject: { select: { id: true, fullName: true, sector: { select: { label: true } } } },
      _count: { select: { answers: true } },
    },
  });

  const groups = new Map<string, EvaluationResultGroup>();

  for (const e of evaluations as Array<{
    id: string; cycle: number | null; total: number | null; createdAt: Date;
    type: { title: string; kind: EvaluationKind; scaleMax: number };
    subject: { id: string; fullName: string; sector: { label: string } | null };
    _count: { answers: number };
  }>) {
    const key = e.subject.id;
    if (!groups.has(key)) {
      groups.set(key, {
        subjectId: e.subject.id,
        subjectName: e.subject.fullName,
        sector: e.subject.sector?.label ?? "—",
        results: [],
      });
    }
    const maxTotal = e._count.answers * e.type.scaleMax;
    (groups.get(key)!.results as EvaluationResultGroup["results"][number][]).push({
      id: e.id,
      typeTitle: e.type.title,
      kind: e.type.kind,
      cycle: e.cycle ?? undefined,
      total: e.total ?? 0,
      maxTotal,
      createdAtLabel: fmtDate(e.createdAt),
    });
  }

  return Array.from(groups.values());
}

/** Detalhe de uma submissão (respostas por questão), para expandir no RH. */
export async function getEvaluationDetail(id: string): Promise<EvaluationResultDetail | null> {
  const e = await prisma.evaluation.findUnique({
    where: { id },
    include: {
      type: { select: { title: true, scaleMax: true, scaleLabels: true } },
      subject: { select: { fullName: true } },
      evaluator: { select: { fullName: true } },
      answers: {
        include: { question: { select: { label: true, order: true } } },
      },
    },
  });
  if (!e) return null;

  const answers = e.answers
    .map((a: { value: number; question: { label: string; order: number } }) => ({
      label: a.question.label,
      value: a.value,
      order: a.question.order,
    }))
    .sort((x: { order: number }, y: { order: number }) => x.order - y.order)
    .map(({ label, value }: { label: string; value: number }) => ({ label, value }));

  return {
    id: e.id,
    typeTitle: e.type.title,
    subjectName: e.subject.fullName,
    evaluatorName: e.evaluator?.fullName ?? undefined,
    cycle: e.cycle ?? undefined,
    total: e.total ?? 0,
    maxTotal: answers.length * e.type.scaleMax,
    scaleLabels: e.type.scaleLabels ?? [],
    observations: e.observations ?? undefined,
    createdAtLabel: fmtDate(e.createdAt),
    answers,
  };
}
