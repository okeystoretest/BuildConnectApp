"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/require-user";
import { can } from "@/lib/permissions";
import { advanceAfterCompletion, ensureCycleSchedule, sweepAvailability } from "@/lib/evaluation-schedule";
import type { Role } from "@/types";

/**
 * Envio de uma avaliação preenchida (Gestor ou Admin).
 *
 * Fluxo transacional:
 *  1. Valida permissão e integridade (todas as questões respondidas, valores
 *     dentro da escala).
 *  2. Cria a Evaluation + respostas e grava o total calculado.
 *  3. Para o Pré-Efetivo: marca o ciclo como CONCLUIDO e agenda o próximo
 *     (+7 dias úteis a partir de agora).
 */

const answerSchema = z.object({
  questionId: z.string().min(1),
  value: z.number().int().min(1),
});

const submitSchema = z.object({
  typeSlug: z.string().min(1),
  subjectId: z.string().min(1),
  cycle: z.number().int().min(1).max(3).optional(),
  observations: z.string().max(2000).optional(),
  answers: z.array(answerSchema).min(1),
});

export interface SubmitResult {
  ok: boolean;
  error?: string;
  evaluationId?: string;
  total?: number;
}

/**
 * Resolve qual ciclo do Pré-Efetivo está disponível para um colaborador.
 * Roda a varredura antes, para promover ciclos vencidos. Retorna o número do
 * ciclo DISPONIVEL (o menor), ou um motivo de indisponibilidade.
 */
export async function resolveAvailableCycle(subjectId: string): Promise<{
  ok: boolean;
  cycle?: number;
  reason?: string;
}> {
  const actor = await getCurrentUser();
  if (!actor) return { ok: false, reason: "Sessão expirada." };
  if (!can(actor.role as Role, "evaluations.view")) {
    return { ok: false, reason: "Sem permissão." };
  }

  const type = await prisma.evaluationType.findFirst({ where: { kind: "PRE_EFETIVO" } });
  if (!type) return { ok: false, reason: "Instrumento não encontrado." };

  // Garante a agenda e promove ciclos vencidos antes de checar.
  await ensureCycleSchedule(subjectId);
  await sweepAvailability();

  const cycles = await prisma.evaluationCycle.findMany({
    where: { subjectId, typeId: type.id },
    orderBy: { cycle: "asc" },
    select: { cycle: true, status: true, availableAt: true },
  });

  if (cycles.length === 0) return { ok: false, reason: "Colaborador sem agenda de ciclos." };

  const available = cycles.find((c: { status: string }) => c.status === "DISPONIVEL");
  if (available) return { ok: true, cycle: available.cycle };

  // Nenhum disponível: explica o porquê (todos concluídos ou próximo agendado).
  const allDone = cycles.every((c: { status: string }) => c.status === "CONCLUIDO");
  if (allDone) return { ok: false, reason: "Todos os 3 ciclos já foram concluídos." };

  const nextScheduled = cycles.find((c: { status: string }) => c.status === "AGENDADO");
  if (nextScheduled) {
    const when = nextScheduled.availableAt.toLocaleDateString("pt-BR");
    return {
      ok: false,
      reason: `Próximo ciclo (${nextScheduled.cycle}) fica disponível em ${when}.`,
    };
  }
  return { ok: false, reason: "Nenhum ciclo disponível no momento." };
}

export async function submitEvaluation(input: unknown): Promise<SubmitResult> {
  const actor = await getCurrentUser();
  if (!actor) return { ok: false, error: "Sessão expirada. Faça login novamente." };
  if (!can(actor.role as Role, "evaluations.view")) {
    return { ok: false, error: "Você não tem permissão para enviar avaliações." };
  }

  const parsed = submitSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const data = parsed.data;

  // Carrega o tipo + perguntas para validar a escala e a completude.
  const type = await prisma.evaluationType.findUnique({
    where: { slug: data.typeSlug },
    include: { sections: { include: { questions: { select: { id: true } } } } },
  });
  if (!type) return { ok: false, error: "Instrumento de avaliação não encontrado." };

  const validQuestionIds = new Set(
    type.sections.flatMap((s: { questions: { id: string }[] }) => s.questions.map((q) => q.id)),
  );

  // Todas as questões precisam de resposta válida (1..scaleMax).
  if (data.answers.length !== validQuestionIds.size) {
    return { ok: false, error: "Responda todas as questões antes de enviar." };
  }
  for (const a of data.answers) {
    if (!validQuestionIds.has(a.questionId)) {
      return { ok: false, error: "Resposta para questão inválida." };
    }
    if (a.value < 1 || a.value > type.scaleMax) {
      return { ok: false, error: `Valores devem estar entre 1 e ${type.scaleMax}.` };
    }
  }

  // Pré-Efetivo exige ciclo; e o ciclo precisa estar DISPONIVEL.
  if (type.hasCycle) {
    if (!data.cycle) return { ok: false, error: "Ciclo não informado." };
    const cycleRow = await prisma.evaluationCycle.findUnique({
      where: {
        subjectId_typeId_cycle: { subjectId: data.subjectId, typeId: type.id, cycle: data.cycle },
      },
      select: { status: true },
    });
    if (!cycleRow) return { ok: false, error: "Ciclo não encontrado para este colaborador." };
    if (cycleRow.status === "CONCLUIDO") {
      return { ok: false, error: "Este ciclo já foi concluído." };
    }
    if (cycleRow.status !== "DISPONIVEL") {
      return { ok: false, error: "Este ciclo ainda não está disponível." };
    }
  }

  const total = data.answers.reduce((sum, a) => sum + a.value, 0);
  const now = new Date();

  try {
    const evaluationId = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const evaluation = await tx.evaluation.create({
        data: {
          typeId: type.id,
          subjectId: data.subjectId,
          evaluatorId: actor.id,
          cycle: type.hasCycle ? data.cycle : null,
          status: "CONCLUIDA",
          total,
          observations: data.observations?.trim() || null,
          answers: {
            create: data.answers.map((a) => ({ questionId: a.questionId, value: a.value })),
          },
        },
      });

      if (type.hasCycle && data.cycle) {
        await tx.evaluationCycle.update({
          where: {
            subjectId_typeId_cycle: {
              subjectId: data.subjectId,
              typeId: type.id,
              cycle: data.cycle,
            },
          },
          data: { status: "CONCLUIDO", completedAt: now },
        });
      }

      return evaluation.id;
    });

    // Fora da transação: agenda o próximo ciclo (+7 dias úteis a partir de agora).
    if (type.hasCycle && data.cycle && data.cycle < 3) {
      await advanceAfterCompletion(data.subjectId, data.cycle, now);
    }

    revalidatePath("/setores/rh");
    return { ok: true, evaluationId, total };
  } catch (e) {
    console.error("[submitEvaluation] falha:", e);
    return { ok: false, error: "Falha ao registrar a avaliação. Tente novamente." };
  }
}
