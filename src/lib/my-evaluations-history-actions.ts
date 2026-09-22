"use server";

import { prisma } from "@/lib/db/prisma";
import { dateLabelBR, timeLabelBR } from "@/lib/brasilia";
import { getCurrentUser } from "@/lib/auth/require-user";
import { getEvaluationDetail } from "@/lib/evaluation-data";
import type { EvaluationResultDetail } from "@/types/evaluation";
import type { FormAnswerView, FormResponseDetail } from "@/types/form";

/**
 * Releitura do que o PRÓPRIO usuário respondeu.
 *
 * Estas actions existem porque `fetchEvaluationDetail` não serve aqui, e não
 * deveria servir: ela autoriza por PAPEL (`evaluations.view` + ferramentas do
 * DHO), porque o que ela abre é a resposta dos outros. Um Colaborador não
 * passa por ela — e não é para passar.
 *
 * O eixo aqui é AUTORIA: a submissão é sua, ou a chamada é recusada. Papel
 * nenhum entra na conta, nos dois sentidos — o Admin também não lê por aqui a
 * resposta de outra pessoa; para isso existe a aba de Resultados do DHO.
 */

interface DetailResult {
  ok: boolean;
  detail?: EvaluationResultDetail;
  error?: string;
}

/** Uma submissão de instrumento (feedback de rodada ou autoavaliação) minha. */
export async function fetchMyEvaluationDetail(id: string): Promise<DetailResult> {
  const actor = await getCurrentUser();
  if (!actor) return { ok: false, error: "Sessão expirada. Faça login novamente." };

  // A checagem vem ANTES de montar o DTO: confirmar a autoria depois de já ter
  // lido tudo deixa a porta aberta para alguém devolver o detalhe por engano
  // num refactor futuro.
  const owner = await prisma.evaluation.findUnique({
    where: { id },
    select: { evaluatorId: true },
  });
  if (!owner) return { ok: false, error: "Avaliação não encontrada." };
  if (owner.evaluatorId !== actor.id) {
    return { ok: false, error: "Esta avaliação não é sua." };
  }

  const detail = await getEvaluationDetail(id);
  if (!detail) return { ok: false, error: "Avaliação não encontrada." };
  return { ok: true, detail };
}

interface FormResult {
  ok: boolean;
  detail?: FormResponseDetail;
  error?: string;
}

/**
 * Uma resposta de formulário do DHO minha, com as perguntas na ordem do
 * formulário e o que eu marquei em cada uma.
 *
 * As perguntas saem do formulário, e não das respostas: pergunta opcional que
 * ficou em branco não gera linha em `FormAnswer`, e listar só o que foi
 * respondido esconderia que havia mais a responder.
 */
export async function fetchMyFormResponse(responseId: string): Promise<FormResult> {
  const actor = await getCurrentUser();
  if (!actor) return { ok: false, error: "Sessão expirada. Faça login novamente." };

  const response = await prisma.formResponse.findUnique({
    where: { id: responseId },
    select: {
      id: true,
      respondentId: true,
      submittedAt: true,
      round: true,
      form: {
        select: {
          title: true,
          description: true,
          questions: {
            orderBy: { order: "asc" },
            select: {
              id: true,
              kind: true,
              label: true,
              helpText: true,
              options: { orderBy: { order: "asc" }, select: { id: true, label: true } },
            },
          },
        },
      },
      answers: { select: { questionId: true, text: true, number: true, optionIds: true } },
    },
  });
  if (!response) return { ok: false, error: "Resposta não encontrada." };
  if (response.respondentId !== actor.id) {
    return { ok: false, error: "Esta resposta não é sua." };
  }

  const byQuestion = new Map(response.answers.map((a) => [a.questionId, a]));

  const answers: FormAnswerView[] = response.form.questions.map((q) => {
    const given = byQuestion.get(q.id);
    const chosen = (given?.optionIds ?? [])
      .map((id) => q.options.find((o) => o.id === id)?.label)
      .filter((l): l is string => Boolean(l));

    // Uma pergunta só, três formas de guardar a resposta no banco — texto,
    // número ou ids de opção. Aqui elas viram uma frase, porque quem relê
    // quer ler, não decifrar o formato.
    const answerLabel =
      given?.text?.trim() ||
      (given?.number != null ? String(given.number) : "") ||
      chosen.join(", ");

    return {
      questionId: q.id,
      kind: q.kind,
      label: q.label,
      helpText: q.helpText ?? undefined,
      answerLabel: answerLabel || "Não respondida",
      answered: Boolean(answerLabel),
    };
  });

  return {
    ok: true,
    detail: {
      id: response.id,
      formTitle: response.form.title,
      description: response.form.description ?? undefined,
      submittedAtLabel: dateLabelBR(response.submittedAt),
      submittedAtTimeLabel: timeLabelBR(response.submittedAt),
      round: response.round,
      answers,
    },
  };
}
