import { prisma } from "@/lib/db/prisma";
import { MATRIZ_DECISAO_SLUG, MULTI_RATER_SLUGS } from "@/lib/evaluation-rounds-config";
import { averageOf, classifyMatriz } from "@/lib/matriz-decisao";
import type {
  AssignableEvaluationType,
  EfficacyRoundRow,
  EfficacyConsolidated,
  EfficacyCompetencyRow,
  EvaluationKind,
  MatrizDecisaoResult,
  MatrizPoint,
  MyEvaluationTask,
} from "@/types/evaluation";

const TZ = "America/Sao_Paulo";

function fmtDate(date: Date): string {
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: TZ,
  });
}

function fmtTime(date: Date): string {
  return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
}

/** Resolve um instrumento de rodada pelo slug (valida que ele é multiavaliador). */
export async function getRoundType(slug: string) {
  if (!MULTI_RATER_SLUGS.includes(slug)) return null;
  return prisma.evaluationType.findUnique({ where: { slug } });
}

/**
 * Instrumentos que aceitam atribuição de avaliadores (card "Atribuir
 * Avaliações"). `questionCount` = 0 significa instrumento sem perguntas
 * cadastradas — a UI bloqueia a atribuição e diz o porquê.
 */
export async function getAssignableEvaluationTypes(): Promise<AssignableEvaluationType[]> {
  const types = await prisma.evaluationType.findMany({
    where: { slug: { in: [...MULTI_RATER_SLUGS] } },
    orderBy: { order: "asc" },
    include: { sections: { select: { _count: { select: { questions: true } } } } },
  });

  return types.map((t) => ({
    id: t.id,
    slug: t.slug,
    kind: t.kind as EvaluationKind,
    title: t.title,
    questionCount: t.sections.reduce((n, s) => n + s._count.questions, 0),
  }));
}

/**
 * Rodadas multidirecionais para a gestão do DHO. Escopo opcional por setor
 * (Gestor) e por instrumento. Traz a contagem de feedback recebido vs. quota e
 * o estado da autoavaliação — sem NUNCA expor respostas individuais (sigilo).
 */
export async function getEvaluationRounds(
  sectors?: string[] | null,
  slugs?: readonly string[],
): Promise<EfficacyRoundRow[]> {
  const rounds = await prisma.evaluationRound.findMany({
    where: {
      ...(sectors && sectors.length > 0
        ? { subject: { sector: { label: { in: sectors } } } }
        : {}),
      ...(slugs && slugs.length > 0 ? { type: { slug: { in: [...slugs] } } } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: {
      type: { select: { slug: true, title: true } },
      subject: { select: { id: true, fullName: true, sector: { select: { label: true } } } },
      assignments: {
        include: { rater: { select: { id: true, fullName: true } } },
        orderBy: { createdAt: "asc" },
      },
      _count: {
        select: { evaluations: { where: { isSelfAssessment: false } } },
      },
    },
  });

  return rounds.map((r) => ({
    id: r.id,
    typeSlug: r.type.slug,
    typeTitle: r.type.title,
    subjectId: r.subject.id,
    subjectName: r.subject.fullName,
    sector: r.subject.sector?.label ?? "—",
    raterQuota: r.raterQuota,
    feedbackDone: r._count.evaluations,
    status: r.status as EfficacyRoundRow["status"],
    selfDone: r.status === "CONCLUIDA",
    createdAtLabel: fmtDate(r.createdAt),
    createdAtTimeLabel: fmtTime(r.createdAt),
    raters: r.assignments.map((a) => ({
      id: a.rater.id,
      name: a.rater.fullName,
      done: a.status === "CONCLUIDA",
    })),
  }));
}

/**
 * Consolidação de uma rodada: uma linha por competência com a nota de cada
 * avaliador — IDENTIFICADO PELO NOME —, a média de feedback e a pontuação de
 * autoavaliação. Exclusivo de quem tem `evaluations.view` (DHO/Gestor): é a
 * visão que mistura as respostas de todo mundo.
 */
export async function getRoundConsolidated(
  roundId: string,
): Promise<EfficacyConsolidated | null> {
  const round = await prisma.evaluationRound.findUnique({
    where: { id: roundId },
    include: {
      type: { select: { title: true, slug: true, scaleMax: true, scaleLabels: true } },
      subject: { select: { fullName: true, sector: { select: { label: true } } } },
      evaluations: {
        orderBy: { createdAt: "asc" },
        include: {
          evaluator: { select: { fullName: true } },
          answers: {
            include: {
              question: {
                select: {
                  id: true,
                  label: true,
                  order: true,
                  // A ordem da seção define o eixo na Matriz de Decisão
                  // (0 = técnico/X, 1 = emocional/Y).
                  section: { select: { order: true } },
                },
              },
            },
          },
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

  // Nomes das colunas de feedback, na mesma ordem de `raterScores`.
  const raterNames = feedbackEvals.map(
    (e) => e.evaluator?.fullName ?? "Avaliador não identificado",
  );

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
    matriz:
      round.type.slug === MATRIZ_DECISAO_SLUG
        ? buildMatriz(round.evaluations, round.type.scaleMax, round.raterQuota + 1)
        : undefined,
    typeTitle: round.type.title,
    typeSlug: round.type.slug,
    scaleMax: round.type.scaleMax,
    scaleLabels: round.type.scaleLabels ?? [],
    subjectName: round.subject.fullName,
    sector: round.subject.sector?.label ?? "—",
    raterNames,
    startedAtLabel: fmtDate(round.createdAt),
    finishedAtLabel: round.completedAt ? fmtDate(round.completedAt) : undefined,
    finishedAtTimeLabel: round.completedAt ? fmtTime(round.completedAt) : undefined,
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
 * Pontos do gráfico da Matriz de Decisão.
 *
 * Cada submissão vira um ponto: X = média das respostas da PRIMEIRA seção
 * (critérios técnicos), Y = média das respostas da SEGUNDA (critérios
 * emocionais). Cada ponto leva o NOME de quem avaliou; a autoavaliação é
 * marcada como tal.
 *
 * O ponto de decisão é a média de TODAS as submissões recebidas — a
 * autoavaliação é uma das posições da sequência, não um dado à parte.
 */
function buildMatriz(
  evaluations: readonly {
    isSelfAssessment: boolean;
    evaluator: { fullName: string } | null;
    answers: readonly { value: number; question: { section: { order: number } } }[];
  }[],
  scaleMax: number,
  expected: number,
): MatrizDecisaoResult {
  const points: MatrizPoint[] = [];
  let index = 0;

  for (const ev of evaluations) {
    const x = averageOf(
      ev.answers.filter((a) => a.question.section.order === 0).map((a) => a.value),
    );
    const y = averageOf(
      ev.answers.filter((a) => a.question.section.order === 1).map((a) => a.value),
    );
    if (x === null || y === null) continue;

    index += 1;
    const name = ev.evaluator?.fullName ?? "Avaliador não identificado";
    points.push({
      id: `ponto-${index}`,
      label: name,
      kind: ev.isSelfAssessment ? "AUTO" : "FEEDBACK",
      x,
      y,
    });
  }

  const overallX = averageOf(points.map((p) => p.x));
  const overallY = averageOf(points.map((p) => p.y));
  const overall = overallX !== null && overallY !== null ? { x: overallX, y: overallY } : null;

  return {
    scaleMax,
    points,
    overall,
    zone: overall ? classifyMatriz(overall.x, overall.y) : null,
    partial: points.length < expected,
    received: points.length,
    expected,
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

  // 3) Formulários do DHO atribuídos e ainda não respondidos. Só de
  //    formulários PUBLICADOS: encerrar congela o resultado e a tarefa some.
  const formAssignments = await prisma.formAssignment.findMany({
    where: { userId, status: "PENDENTE", form: { status: "PUBLICADO" } },
    orderBy: { createdAt: "asc" },
    select: { form: { select: { id: true, title: true } } },
  });
  for (const a of formAssignments) {
    tasks.push({
      kind: "FORMULARIO",
      roundId: "",
      formId: a.form.id,
      typeSlug: "formulario",
      typeTitle: "Formulário do DHO",
      subjectName: a.form.title,
      self: false,
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

/**
 * Quantas avaliações estão pendentes para o usuário — o número do indicador
 * vermelho em "Minhas Avaliações".
 *
 * Espelha exatamente `getMyEvaluationTasks`, em contagem: feedbacks designados
 * em rodada ainda coletando, a autoavaliação de rodadas que já fecharam o
 * feedback e ainda não receberam a resposta do próprio avaliado, e os
 * formulários do DHO atribuídos e não respondidos.
 *
 * Conta em vez de montar os DTOs porque roda a cada requisição de página, para
 * qualquer tela: são três contagens sobre índice, sem carregar formulário,
 * nome de avaliado nem título de instrumento.
 */
export async function countMyPendingEvaluations(userId: string): Promise<number> {
  const [feedback, selfAssessment, forms] = await Promise.all([
    prisma.evaluationAssignment.count({
      where: {
        raterId: userId,
        status: "PENDENTE",
        round: { status: "COLETANDO_FEEDBACK" },
      },
    }),
    prisma.evaluationRound.count({
      where: {
        subjectId: userId,
        status: "AGUARDANDO_AUTO",
        evaluations: { none: { isSelfAssessment: true } },
      },
    }),
    prisma.formAssignment.count({
      where: { userId, status: "PENDENTE", form: { status: "PUBLICADO" } },
    }),
  ]);

  return feedback + selfAssessment + forms;
}
