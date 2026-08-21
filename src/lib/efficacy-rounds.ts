import { prisma } from "@/lib/db/prisma";
import type {
  EfficacyRoundRow,
  EfficacyConsolidated,
  EfficacyCompetencyRow,
  MyEvaluationTask,
} from "@/types/evaluation";

export const EFICACIA_SLUG = "eficacia-no-trabalho";

function fmtDate(date: Date): string {
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Resolve o EvaluationType da Eficácia (único instrumento com rodadas). */
export async function getEficaciaType() {
  return prisma.evaluationType.findUnique({ where: { slug: EFICACIA_SLUG } });
}

/**
 * Rodadas de Eficácia para a gestão do RH. Escopo opcional por setor (Gestor).
 * Traz a contagem de feedback recebido vs. quota e o estado da autoavaliação —
 * sem NUNCA expor respostas individuais (sigilo).
 */
export async function getEfficacyRounds(
  sectors?: string[] | null,
): Promise<EfficacyRoundRow[]> {
  const rounds = await prisma.evaluationRound.findMany({
    where: {
      ...(sectors && sectors.length > 0
        ? { subject: { sector: { label: { in: sectors } } } }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    include: {
      subject: { select: { id: true, fullName: true, sector: { select: { label: true } } } },
      assignments: {
        include: { rater: { select: { fullName: true } } },
        orderBy: { createdAt: "asc" },
      },
      _count: {
        select: { evaluations: { where: { isSelfAssessment: false } } },
      },
    },
  });

  return rounds.map((r) => {
    const feedbackDone = r._count.evaluations;
    return {
      id: r.id,
      subjectId: r.subject.id,
      subjectName: r.subject.fullName,
      sector: r.subject.sector?.label ?? "—",
      raterQuota: r.raterQuota,
      feedbackDone,
      status: r.status as EfficacyRoundRow["status"],
      selfDone: r.status === "CONCLUIDA",
      createdAtLabel: fmtDate(r.createdAt),
      raters: r.assignments.map((a) => ({
        name: a.rater.fullName,
        done: a.status === "CONCLUIDA",
      })),
    };
  });
}

/**
 * Consolidação de uma rodada (imagem 3): uma linha por competência com a nota
 * de cada avaliador (anônima — "Pessoa 1..N", sem nome), a média de feedback e
 * a pontuação de autoavaliação. Exclusivo do RH — mistura respostas, então
 * nunca deve chegar a um avaliador.
 */
export async function getEfficacyConsolidated(
  roundId: string,
): Promise<EfficacyConsolidated | null> {
  const round = await prisma.evaluationRound.findUnique({
    where: { id: roundId },
    include: {
      type: { select: { title: true, scaleMax: true } },
      subject: { select: { fullName: true, sector: { select: { label: true } } } },
      evaluations: {
        orderBy: { createdAt: "asc" },
        include: {
          answers: { include: { question: { select: { id: true, label: true, order: true } } } },
        },
      },
    },
  });
  if (!round) return null;

  // Ordena competências pela ordem da questão (ET1..ET20).
  const questionOrder = new Map<string, { label: string; order: number }>();
  for (const ev of round.evaluations) {
    for (const a of ev.answers) {
      if (!questionOrder.has(a.question.id)) {
        questionOrder.set(a.question.id, { label: a.question.label, order: a.question.order });
      }
    }
  }
  const competencies = Array.from(questionOrder.entries())
    .map(([id, q]) => ({ id, ...q }))
    .sort((x, y) => x.order - y.order);

  const feedbackEvals = round.evaluations.filter((e) => !e.isSelfAssessment);
  const selfEval = round.evaluations.find((e) => e.isSelfAssessment) ?? null;

  const rows: EfficacyCompetencyRow[] = competencies.map((c: { id: string; label: string; order: number }) => {
    const feedbackScores = feedbackEvals.map((ev): number | null => {
      const ans = ev.answers.find((a: { question: { id: string }; value: number }) => a.question.id === c.id);
      return ans ? ans.value : null;
    });
    const present = feedbackScores.filter((v): v is number => v !== null);
    const feedbackAvg =
      present.length > 0 ? present.reduce((s: number, v: number) => s + v, 0) / present.length : null;
    const selfAns = selfEval?.answers.find((a: { question: { id: string }; value: number }) => a.question.id === c.id);
    return {
      label: c.label,
      raterScores: feedbackScores,
      feedbackAvg: feedbackAvg !== null ? Math.round(feedbackAvg * 100) / 100 : null,
      selfScore: selfAns ? selfAns.value : null,
    };
  });

  // Média geral (rodapé "MÉDIA GERAL").
  const allFeedbackAvgs = rows.map((r) => r.feedbackAvg).filter((v): v is number => v !== null);
  const overallFeedback =
    allFeedbackAvgs.length > 0
      ? Math.round((allFeedbackAvgs.reduce((s, v) => s + v, 0) / allFeedbackAvgs.length) * 100) / 100
      : null;
  const allSelf = rows.map((r) => r.selfScore).filter((v): v is number => v !== null);
  const overallSelf =
    allSelf.length > 0
      ? Math.round((allSelf.reduce((s, v) => s + v, 0) / allSelf.length) * 100) / 100
      : null;

  return {
    roundId: round.id,
    typeTitle: round.type.title,
    scaleMax: round.type.scaleMax,
    subjectName: round.subject.fullName,
    sector: round.subject.sector?.label ?? "—",
    raterCount: feedbackEvals.length,
    raterQuota: round.raterQuota,
    hasSelf: Boolean(selfEval),
    status: round.status as EfficacyConsolidated["status"],
    competencies: rows,
    overallFeedback,
    overallSelf,
  };
}

/**
 * Tarefas de avaliação do usuário logado (aba "Minhas avaliações"):
 *  - Avaliações de feedback em que ele foi designado e ainda não enviou.
 *  - A autoavaliação dele, quando a rodada estiver AGUARDANDO_AUTO e ele ainda
 *    não tiver enviado.
 */
export async function getMyEvaluationTasks(userId: string): Promise<MyEvaluationTask[]> {
  const tasks: MyEvaluationTask[] = [];

  // 1) Feedbacks designados pendentes.
  const assignments = await prisma.evaluationAssignment.findMany({
    where: { raterId: userId, status: "PENDENTE" },
    orderBy: { createdAt: "asc" },
    include: {
      round: {
        include: {
          type: { select: { slug: true, title: true } },
          subject: { select: { fullName: true } },
        },
      },
    },
  });
  for (const a of assignments) {
    // Rodadas já fechadas para feedback não devem mais aparecer como pendentes.
    if (a.round.status !== "COLETANDO_FEEDBACK") continue;
    tasks.push({
      kind: "FEEDBACK",
      roundId: a.round.id,
      typeSlug: a.round.type.slug,
      typeTitle: a.round.type.title,
      subjectName: a.round.subject.fullName,
      self: false,
    });
  }

  // 2) Autoavaliação pendente (rodadas onde eu sou o sujeito).
  const myRounds = await prisma.evaluationRound.findMany({
    where: { subjectId: userId, status: "AGUARDANDO_AUTO" },
    include: { type: { select: { slug: true, title: true } } },
  });
  for (const r of myRounds) {
    const already = await prisma.evaluation.count({
      where: { roundId: r.id, isSelfAssessment: true },
    });
    if (already > 0) continue;
    tasks.push({
      kind: "AUTOAVALIACAO",
      roundId: r.id,
      typeSlug: r.type.slug,
      typeTitle: r.type.title,
      subjectName: "Você",
      self: true,
    });
  }

  return tasks;
}

/**
 * Pessoas selecionáveis como avaliadores de feedback (qualquer usuário ativo).
 * Escopo opcional por setor (Gestor vê só o próprio). Exclui, na UI, o próprio
 * avaliado — mas isso é validado também no server.
 */
export async function getRaterRoster(
  sectors?: string[] | null,
): Promise<{ id: string; name: string; sector: string }[]> {
  const users = await prisma.user.findMany({
    where: {
      active: true,
      ...(sectors && sectors.length > 0 ? { sector: { label: { in: sectors } } } : {}),
    },
    select: { id: true, fullName: true, sector: { select: { label: true } } },
    orderBy: { fullName: "asc" },
  });
  return users.map((u) => ({ id: u.id, name: u.fullName, sector: u.sector?.label ?? "—" }));
}
