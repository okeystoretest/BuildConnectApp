"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/require-user";
import { can } from "@/lib/permissions";
import { getRoundType, getRoundConsolidated } from "@/lib/evaluation-rounds";
import { MAX_TOTAL_RATERS, MIN_TOTAL_RATERS } from "@/lib/evaluation-rounds-config";
import type { Role } from "@/types";
import type { EfficacyConsolidated } from "@/types/evaluation";

/**
 * Ações das avaliações multidirecionais (rodadas com N avaliadores).
 *
 * Instrumentos: Matriz de Decisão e Eficácia (360°) — ver
 * `evaluation-rounds-config.ts`, fonte única dos slugs.
 *
 * Papéis:
 *  - DHO/Admin/Gestor (evaluations.view): atribui a avaliação — escolhe o
 *    instrumento, o avaliado, a quantidade TOTAL de avaliadores e quem ocupa
 *    cada posição.
 *  - Avaliadores designados (evaluations.fill): enviam seu feedback. Cada um
 *    responde só o próprio formulário; a consolidação é do DHO.
 *  - Avaliado: ocupa SEMPRE a última posição da sequência (autoavaliação). Ela
 *    é liberada quando o feedback dos demais fecha.
 *
 * Contabilidade da quota: `raterQuota` no banco conta só o feedback. Se o DHO
 * define 3 avaliadores no total, gravamos raterQuota = 2 + a autoavaliação.
 *
 * Fechamento (em transação, resistente a envios simultâneos):
 *  - feedback == raterQuota → rodada AGUARDANDO_AUTO e notifica o avaliado.
 *  - autoavaliação recebida → rodada CONCLUIDA.
 */

// ── Atribuição de avaliação (criação de rodada) ───────────────

const assignSchema = z.object({
  typeSlug: z.string().min(1),
  subjectId: z.string().min(1),
  /** Quantidade TOTAL de avaliadores, incluindo a autoavaliação do avaliado. */
  totalRaters: z.number().int().min(MIN_TOTAL_RATERS).max(MAX_TOTAL_RATERS),
  /** Avaliadores de feedback, na ordem das posições 1..totalRaters-1. */
  raterIds: z.array(z.string().min(1)).min(1).max(MAX_TOTAL_RATERS - 1),
});

export interface RoundResult {
  ok: boolean;
  error?: string;
  roundId?: string;
}

/**
 * Abre uma rodada de avaliação multidirecional.
 * A última posição da sequência é preenchida automaticamente pelo próprio
 * avaliado — por isso `raterIds` traz apenas `totalRaters - 1` pessoas.
 */
export async function assignEvaluation(input: unknown): Promise<RoundResult> {
  const actor = await getCurrentUser();
  if (!actor) return { ok: false, error: "Sessão expirada. Faça login novamente." };
  if (!can(actor.role as Role, "evaluations.view")) {
    return { ok: false, error: "Você não tem permissão para atribuir avaliações." };
  }

  const parsed = assignSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const { typeSlug, subjectId, totalRaters, raterIds } = parsed.data;

  // A autoavaliação ocupa a última posição — sobram totalRaters - 1 no feedback.
  const feedbackQuota = totalRaters - 1;
  const uniqueRaters = Array.from(new Set(raterIds));
  if (uniqueRaters.length !== feedbackQuota) {
    return {
      ok: false,
      error: `Designe ${feedbackQuota} avaliador(es). A última posição é a autoavaliação de quem está sendo avaliado.`,
    };
  }
  if (uniqueRaters.includes(subjectId)) {
    return {
      ok: false,
      error: "O avaliado já ocupa a última posição (autoavaliação) — não o repita nas demais.",
    };
  }

  const type = await getRoundType(typeSlug);
  if (!type) return { ok: false, error: "Instrumento inválido para atribuição." };

  const questionCount = await prisma.evaluationQuestion.count({
    where: { section: { typeId: type.id } },
  });
  if (questionCount === 0) {
    return {
      ok: false,
      error: `"${type.title}" ainda não tem perguntas cadastradas — os avaliadores não teriam o que responder.`,
    };
  }

  // Valida existência/ativação do avaliado e dos avaliadores.
  const people = await prisma.user.findMany({
    where: { id: { in: [subjectId, ...uniqueRaters] }, active: true },
    select: { id: true, fullName: true, sector: { select: { label: true } } },
  });
  const found = new Set(people.map((p) => p.id));
  if (!found.has(subjectId) || uniqueRaters.some((r) => !found.has(r))) {
    return { ok: false, error: "Colaborador ou avaliador inválido/inativo." };
  }
  const subjectName = people.find((p) => p.id === subjectId)?.fullName ?? "colaborador";

  // Escopo do Gestor: só atribui para o próprio setor.
  if (!can(actor.role as Role, "sector.hr")) {
    const actorSector = await prisma.user.findUnique({
      where: { id: actor.id },
      select: { sector: { select: { label: true } } },
    });
    const subjSector = people.find((p) => p.id === subjectId)?.sector?.label ?? null;
    if (!actorSector?.sector || actorSector.sector.label !== subjSector) {
      return { ok: false, error: "Gestor só atribui avaliação para colaboradores do próprio setor." };
    }
  }

  // Uma rodada aberta por vez, por instrumento e avaliado — evita duplicar
  // notificação e consolidação ambígua.
  const openRound = await prisma.evaluationRound.count({
    where: { typeId: type.id, subjectId, status: { not: "CONCLUIDA" } },
  });
  if (openRound > 0) {
    return { ok: false, error: `Já existe uma rodada aberta de ${type.title} para ${subjectName}.` };
  }

  try {
    const now = new Date();
    const roundId = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const round = await tx.evaluationRound.create({
        data: {
          typeId: type.id,
          subjectId,
          raterQuota: feedbackQuota,
          status: "COLETANDO_FEEDBACK",
          assignments: {
            create: uniqueRaters.map((raterId) => ({
              raterId,
              status: "PENDENTE",
              notifiedAt: now,
            })),
          },
        },
      });

      // Notifica cada avaliador designado (alvo individual).
      await tx.notification.createMany({
        data: uniqueRaters.map((raterId) => ({
          kind: "AVALIACAO" as const,
          title: "Você foi designado para uma avaliação",
          body: `Avalie ${subjectName} — ${type.title}.`,
          href: "/minhas-avaliacoes",
          audience: [],
          targetUserId: raterId,
        })),
      });

      return round.id;
    });

    revalidatePath("/setores/rh");
    revalidatePath("/minhas-avaliacoes");
    return { ok: true, roundId };
  } catch (e) {
    console.error("[assignEvaluation] falha:", e);
    return { ok: false, error: "Falha ao atribuir a avaliação. Tente novamente." };
  }
}

// ── Submissão (feedback ou autoavaliação) ─────────────────────

const answerSchema = z.object({
  questionId: z.string().min(1),
  value: z.number().int().min(1),
});

const submitSchema = z.object({
  roundId: z.string().min(1),
  self: z.boolean(),
  observations: z.string().max(2000).optional(),
  answers: z.array(answerSchema).min(1),
});

export interface SubmitResult {
  ok: boolean;
  error?: string;
  total?: number;
}

export async function submitRoundEvaluation(input: unknown): Promise<SubmitResult> {
  const actor = await getCurrentUser();
  if (!actor) return { ok: false, error: "Sessão expirada. Faça login novamente." };
  if (!can(actor.role as Role, "evaluations.fill")) {
    return { ok: false, error: "Você não tem permissão para enviar esta avaliação." };
  }

  const parsed = submitSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const data = parsed.data;

  const round = await prisma.evaluationRound.findUnique({
    where: { id: data.roundId },
    include: {
      type: {
        select: {
          id: true,
          scaleMax: true,
          sections: { select: { questions: { select: { id: true } } } },
        },
      },
      subject: { select: { id: true, fullName: true } },
    },
  });
  if (!round) return { ok: false, error: "Rodada não encontrada." };

  // Autorização por papel na rodada.
  if (data.self) {
    if (round.subject.id !== actor.id) {
      return { ok: false, error: "Só o próprio colaborador faz a autoavaliação." };
    }
    if (round.status !== "AGUARDANDO_AUTO") {
      return { ok: false, error: "A autoavaliação ainda não está liberada." };
    }
  } else {
    const assignment = await prisma.evaluationAssignment.findUnique({
      where: { roundId_raterId: { roundId: round.id, raterId: actor.id } },
      select: { status: true },
    });
    if (!assignment) {
      return { ok: false, error: "Você não foi designado para avaliar este colaborador." };
    }
    if (assignment.status === "CONCLUIDA") {
      return { ok: false, error: "Você já enviou esta avaliação." };
    }
    if (round.status !== "COLETANDO_FEEDBACK") {
      return { ok: false, error: "Esta rodada não está mais coletando feedback." };
    }
  }

  // Validação de escala/completude.
  const validQuestionIds = new Set(
    round.type.sections.flatMap((s) => s.questions.map((q) => q.id)),
  );
  if (data.answers.length !== validQuestionIds.size) {
    return { ok: false, error: "Responda todas as competências antes de enviar." };
  }
  for (const a of data.answers) {
    if (!validQuestionIds.has(a.questionId)) {
      return { ok: false, error: "Resposta para competência inválida." };
    }
    if (a.value < 1 || a.value > round.type.scaleMax) {
      return { ok: false, error: `Valores devem estar entre 1 e ${round.type.scaleMax}.` };
    }
  }

  const total = data.answers.reduce((sum, a) => sum + a.value, 0);
  const now = new Date();

  try {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Cria a submissão. O @@unique([evaluationId, questionId]) protege as
      // respostas; a corrida de dupla-submissão do mesmo avaliador é barrada
      // pela atualização condicional do assignment abaixo.
      await tx.evaluation.create({
        data: {
          typeId: round.type.id,
          subjectId: round.subject.id,
          evaluatorId: actor.id,
          roundId: round.id,
          isSelfAssessment: data.self,
          status: "CONCLUIDA",
          total,
          observations: data.observations?.trim() || null,
          answers: { create: data.answers.map((a) => ({ questionId: a.questionId, value: a.value })) },
        },
      });

      if (!data.self) {
        // Marca o assignment como concluído (idempotência do avaliador).
        await tx.evaluationAssignment.update({
          where: { roundId_raterId: { roundId: round.id, raterId: actor.id } },
          data: { status: "CONCLUIDA", completedAt: now },
        });

        // Recontagem DENTRO da transação: fecha a coleta quando bater a quota.
        const feedbackCount = await tx.evaluation.count({
          where: { roundId: round.id, isSelfAssessment: false },
        });
        if (feedbackCount >= round.raterQuota && round.status === "COLETANDO_FEEDBACK") {
          await tx.evaluationRound.update({
            where: { id: round.id },
            data: { status: "AGUARDANDO_AUTO", selfNotifiedAt: now },
          });
          // Notifica o colaborador para fazer a autoavaliação (alvo individual).
          await tx.notification.create({
            data: {
              kind: "AVALIACAO",
              title: "Faça sua autoavaliação",
              body: `As avaliações sobre você foram concluídas. Registre sua autoavaliação.`,
              href: "/minhas-avaliacoes",
              audience: [],
              targetUserId: round.subject.id,
            },
          });
        }
      } else {
        // Autoavaliação recebida → rodada concluída.
        await tx.evaluationRound.update({
          where: { id: round.id },
          data: { status: "CONCLUIDA", completedAt: now },
        });
      }
    });

    revalidatePath("/minhas-avaliacoes");
    revalidatePath("/setores/rh");
    return { ok: true, total };
  } catch (e) {
    console.error("[submitRoundEvaluation] falha:", e);
    return { ok: false, error: "Falha ao registrar a avaliação. Tente novamente." };
  }
}

// ── Consolidação (exclusiva de quem tem evaluations.view) ─────

/**
 * Consolidação de uma rodada: médias por competência + coluna de
 * autoavaliação, com o nome de cada avaliador. Restrita a `evaluations.view`
 * (DHO/Gestor/Admin) — junta as respostas de várias pessoas numa tela só.
 */
export async function fetchRoundConsolidated(
  roundId: string,
): Promise<{ ok: boolean; data?: EfficacyConsolidated; error?: string }> {
  const actor = await getCurrentUser();
  if (!actor) return { ok: false, error: "Sessão expirada." };
  if (!can(actor.role as Role, "evaluations.view")) {
    return { ok: false, error: "Sem permissão." };
  }
  const data = await getRoundConsolidated(roundId);
  if (!data) return { ok: false, error: "Rodada não encontrada." };
  return { ok: true, data };
}
