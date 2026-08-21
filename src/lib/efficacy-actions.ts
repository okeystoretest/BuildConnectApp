"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/require-user";
import { can } from "@/lib/permissions";
import { getEficaciaType } from "@/lib/efficacy-rounds";
import type { Role } from "@/types";

/**
 * Ações da Avaliação Multidirecional de Eficácia (rodadas 360°).
 *
 * Papéis:
 *  - RH/Admin/Gestor (evaluations.view): abre a rodada, define a quota de
 *    avaliadores (padrão 2) e designa quem avalia.
 *  - Avaliadores designados (evaluations.fill): enviam seu feedback. Sigilo:
 *    ninguém vê a resposta de outro.
 *  - Colaborador avaliado: ao fechar a quota de feedback, é notificado para
 *    enviar a autoavaliação; ele mesmo a preenche.
 *
 * Fechamento (em transação, resistente a envios simultâneos):
 *  - Quando as submissões de feedback == raterQuota → rodada AGUARDANDO_AUTO e
 *    notifica o colaborador (Notification.targetUserId).
 *  - Quando a autoavaliação chega → rodada CONCLUIDA.
 */

// ── Criação de rodada ─────────────────────────────────────────

const createRoundSchema = z.object({
  subjectId: z.string().min(1),
  raterQuota: z.number().int().min(1).max(5).default(2),
  raterIds: z.array(z.string().min(1)).min(1).max(5),
});

export interface RoundResult {
  ok: boolean;
  error?: string;
  roundId?: string;
}

export async function createEfficacyRound(input: unknown): Promise<RoundResult> {
  const actor = await getCurrentUser();
  if (!actor) return { ok: false, error: "Sessão expirada. Faça login novamente." };
  if (!can(actor.role as Role, "evaluations.view")) {
    return { ok: false, error: "Você não tem permissão para abrir avaliações de Eficácia." };
  }

  const parsed = createRoundSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const { subjectId, raterQuota, raterIds } = parsed.data;

  // A quota deve bater com o número de avaliadores designados.
  const uniqueRaters = Array.from(new Set(raterIds));
  if (uniqueRaters.length !== raterQuota) {
    return { ok: false, error: `Designe exatamente ${raterQuota} avaliador(es).` };
  }
  if (uniqueRaters.includes(subjectId)) {
    return { ok: false, error: "O colaborador avaliado não pode ser um dos avaliadores." };
  }

  const type = await getEficaciaType();
  if (!type) return { ok: false, error: "Instrumento de Eficácia não encontrado." };

  // Valida existência/ativação do sujeito e dos avaliadores.
  const people = await prisma.user.findMany({
    where: { id: { in: [subjectId, ...uniqueRaters] }, active: true },
    select: { id: true, fullName: true, sector: { select: { label: true } } },
  });
  const found = new Set(people.map((p) => p.id));
  if (!found.has(subjectId) || uniqueRaters.some((r) => !found.has(r))) {
    return { ok: false, error: "Colaborador ou avaliador inválido/inativo." };
  }
  const subjectName = people.find((p) => p.id === subjectId)!.fullName;

  // Escopo do Gestor: só abre rodada para o próprio setor.
  if (!can(actor.role as Role, "sector.hr")) {
    const actorSector = await prisma.user.findUnique({
      where: { id: actor.id },
      select: { sector: { select: { label: true } } },
    });
    const subjSector = people.find((p) => p.id === subjectId)?.sector?.label ?? null;
    if (!actorSector?.sector || actorSector.sector.label !== subjSector) {
      return { ok: false, error: "Gestor só abre rodada para colaboradores do próprio setor." };
    }
  }

  try {
    const now = new Date();
    const roundId = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const round = await tx.evaluationRound.create({
        data: {
          typeId: type.id,
          subjectId,
          raterQuota,
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
          body: `Avalie ${subjectName} — Eficácia no Trabalho.`,
          href: "/minhas-avaliacoes",
          audience: [],
          targetUserId: raterId,
        })),
      });

      return round.id;
    });

    revalidatePath("/setores/rh");
    return { ok: true, roundId };
  } catch (e) {
    console.error("[createEfficacyRound] falha:", e);
    return { ok: false, error: "Falha ao abrir a rodada. Tente novamente." };
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

export async function submitEfficacyEvaluation(input: unknown): Promise<SubmitResult> {
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
              body: `As avaliações de Eficácia sobre você foram concluídas. Registre sua autoavaliação.`,
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
    console.error("[submitEfficacyEvaluation] falha:", e);
    return { ok: false, error: "Falha ao registrar a avaliação. Tente novamente." };
  }
}
