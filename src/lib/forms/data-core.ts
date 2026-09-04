import { prisma } from "@/lib/db/prisma";
import { aggregate, type QuestionResult } from "./aggregate";
import type { FormDraft, FormListItem, FormQuestionKind, FormStatus } from "@/types/form";

/**
 * Leitura dos formulários, sem a sessão.
 *
 * Mesma separação de `core.ts`: o escopo chega por parâmetro em vez de sair do
 * cookie, e por isso estas funções rodam em teste contra um banco de verdade.
 * `data.ts` resolve QUEM está lendo e delega para cá.
 *
 * O recorte por setor é CLÁUSULA DE CONSULTA, não filtro de tela: o gestor de
 * outro setor não recebe o formulário, em vez de recebê-lo e não vê-lo.
 */

/** Escopo já resolvido: `null` é ADMIN (lê tudo). */
export type ReadScope = { ownerSectorId: string } | null;

function dateLabel(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

export async function formsInScope(scope: ReadScope): Promise<FormListItem[]> {
  const rows = await prisma.form.findMany({
    where: scope === null ? {} : { ownerSectorId: scope.ownerSectorId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      status: true,
      anonymous: true,
      createdAt: true,
      _count: { select: { responses: true, assignments: true } },
    },
  });

  return rows.map((f) => ({
    id: f.id,
    title: f.title,
    status: f.status as FormStatus,
    anonymous: f.anonymous,
    responseCount: f._count.responses,
    assignedCount: f._count.assignments,
    createdAtLabel: dateLabel(f.createdAt),
  }));
}

export async function formDraftInScope(
  scope: ReadScope,
  formId: string,
): Promise<FormDraft | null> {
  const form = await prisma.form.findFirst({
    where: {
      id: formId,
      ...(scope === null ? {} : { ownerSectorId: scope.ownerSectorId }),
    },
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

export interface FormResults {
  form: FormDraft;
  results: QuestionResult[];
  responseCount: number;
  assignedCount: number;
  /** Quem ainda não respondeu. Funciona mesmo no anônimo: sai da atribuição. */
  pending: { id: string; name: string }[];
  /** Rodada exibida. */
  round: number;
  /** Rodadas que têm resposta gravada, para o seletor do dashboard. */
  rounds: number[];
}

/**
 * Resultados de UMA rodada.
 *
 * Sem o recorte por rodada, reabrir um formulário somaria as duas coletas na
 * mesma média — um número que existe e está errado, que é pior do que número
 * nenhum. Sem `round`, mostra a rodada em curso.
 */
export async function formResultsInScope(
  scope: ReadScope,
  formId: string,
  round?: number,
): Promise<FormResults | null> {
  const form = await formDraftInScope(scope, formId);
  if (!form) return null;

  const shown = round ?? form.currentRound;

  const [responses, assignments, roundRows] = await Promise.all([
    prisma.formResponse.findMany({
      where: { formId, round: shown },
      select: {
        answers: { select: { questionId: true, text: true, number: true, optionIds: true } },
      },
    }),
    prisma.formAssignment.findMany({
      where: { formId },
      select: { status: true, user: { select: { id: true, fullName: true, active: true } } },
    }),
    prisma.formResponse.findMany({
      where: { formId },
      select: { round: true },
      distinct: ["round"],
      orderBy: { round: "asc" },
    }),
  ]);

  return {
    form,
    results: aggregate(
      form,
      responses.map((r) => ({
        answers: r.answers.map((a) => ({
          questionId: a.questionId,
          text: a.text ?? undefined,
          number: a.number ?? undefined,
          optionIds: a.optionIds,
        })),
      })),
    ),
    responseCount: responses.length,
    assignedCount: assignments.length,
    // Usuário desativado sai da cobrança: pendência dele não é acionável.
    pending: assignments
      .filter((a) => a.status === "PENDENTE" && a.user.active)
      .map((a) => ({ id: a.user.id, name: a.user.fullName })),
    round: shown,
    // A rodada em curso entra mesmo sem resposta ainda: reabriu, ela existe.
    rounds: [...new Set([...roundRows.map((r) => r.round), form.currentRound])].sort(
      (a, b) => a - b,
    ),
  };
}
