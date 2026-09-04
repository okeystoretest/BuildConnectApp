import { prisma } from "@/lib/db/prisma";
import { canRespond } from "./rules";
import { validateSubmission } from "./validation";
import type { FormAnswerInput, FormDraft, FormQuestionKind, FormStatus } from "@/types/form";

/**
 * O trabalho do preenchimento, sem a sessão.
 *
 * Mesma separação de `core.ts`, e pelo mesmo motivo: com o usuário recebido por
 * parâmetro, isto roda em teste contra um banco de verdade. A guarda aqui é a
 * ATRIBUIÇÃO, não `forms.manage` — quem responde é colaborador e não tem, nem
 * deve ter, permissão de gestão.
 */

export interface SubmitResult {
  ok: boolean;
  error?: string;
}

/** O formulário que este usuário foi designado a responder. */
export async function assignedFormFor(
  userId: string,
  formId: string,
): Promise<FormDraft | null> {
  const assignment = await prisma.formAssignment.findUnique({
    where: { formId_userId: { formId, userId } },
    select: { status: true },
  });
  if (!assignment) return null;

  const form = await prisma.form.findUnique({
    where: { id: formId },
    include: {
      sections: {
        orderBy: { order: "asc" },
        include: {
          questions: {
            orderBy: { order: "asc" },
            include: { options: { orderBy: { order: "asc" } } },
          },
        },
      },
    },
  });
  if (!form) return null;
  if (!canRespond({ status: form.status as FormStatus }, assignment)) return null;

  return {
    id: form.id,
    title: form.title,
    description: form.description ?? undefined,
    status: form.status as FormStatus,
    anonymous: form.anonymous,
    dueAt: form.dueAt?.toISOString(),
    currentRound: form.currentRound,
    sections: form.sections.map((s) => ({
      id: s.id,
      title: s.title,
      description: s.description ?? undefined,
      order: s.order,
      questions: s.questions.map((q) => ({
        id: q.id,
        kind: q.kind as FormQuestionKind,
        label: q.label,
        helpText: q.helpText ?? undefined,
        required: q.required,
        order: q.order,
        options: q.options.map((o) => ({ id: o.id, label: o.label, order: o.order })),
        scaleMin: q.scaleMin ?? undefined,
        scaleMax: q.scaleMax ?? undefined,
        scaleMinLabel: q.scaleMinLabel ?? undefined,
        scaleMaxLabel: q.scaleMaxLabel ?? undefined,
      })),
    })),
  };
}

export async function submitResponseFor(
  userId: string,
  input: { formId: string; answers: FormAnswerInput[] },
): Promise<SubmitResult> {
  const form = await assignedFormFor(userId, input.formId);
  if (!form) {
    return { ok: false, error: "Este formulário não está disponível para você." };
  }

  const check = validateSubmission(form, input.answers);
  if (!check.ok) return { ok: false, error: check.error };

  try {
    await prisma.$transaction(async (tx) => {
      // Marca a atribuição PRIMEIRO, condicionada a ainda estar pendente. Dois
      // envios simultâneos: o segundo encontra count 0 e a transação inteira é
      // desfeita, em vez de gravar resposta duplicada.
      const claimed = await tx.formAssignment.updateMany({
        where: { formId: input.formId, userId, status: "PENDENTE" },
        data: { status: "CONCLUIDA", respondedAt: new Date() },
      });
      if (claimed.count === 0) {
        throw new Error("JA_RESPONDIDO");
      }

      await tx.formResponse.create({
        data: {
          formId: input.formId,
          // Anônimo NÃO grava o autor. Quem falta responder sai da atribuição.
          respondentId: form.anonymous ? null : userId,
          // Carimba a rodada em curso. É o que mantém a coleta anterior
          // consultável depois de reabrir, em vez de somar tudo na mesma média.
          round: form.currentRound,
          answers: {
            create: input.answers.map((a) => ({
              questionId: a.questionId,
              text: a.text?.trim() || null,
              number: a.number ?? null,
              optionIds: a.optionIds ?? [],
            })),
          },
        },
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "JA_RESPONDIDO") {
      return { ok: false, error: "Você já respondeu este formulário." };
    }
    console.error("[submitResponseFor] falha:", error);
    return { ok: false, error: "Não foi possível enviar suas respostas." };
  }

  return { ok: true };
}
