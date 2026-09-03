import { KINDS_WITH_OPTIONS } from "@/types/form";
import type { FormAnswerInput, FormDraft, FormQuestionDraft } from "@/types/form";

/**
 * Valida uma submissão contra a definição do formulário.
 *
 * Roda no SERVIDOR antes de gravar. A tela também impede o inválido, mas a
 * Server Action recebe o que o cliente mandar — inclusive de um cliente que
 * não é a tela.
 *
 * Devolve a primeira falha encontrada, com mensagem em português pronta para
 * exibição: quem envia formulário quer saber o que corrigir, não uma lista.
 */
export type ValidationResult = { ok: true } | { ok: false; error: string };

/**
 * "Respondida" para efeito de obrigatoriedade.
 *
 * Exportada porque a TELA precisa da mesma noção para habilitar o botão
 * "Próximo". Se cada lado tivesse a sua, o usuário veria o botão liberado e o
 * servidor recusaria — ou o contrário.
 */
export function isQuestionAnswered(
  question: FormQuestionDraft,
  answer: FormAnswerInput | undefined,
): boolean {
  if (!answer) return false;
  if (question.kind === "ESCALA_LINEAR") return typeof answer.number === "number";
  if (KINDS_WITH_OPTIONS.includes(question.kind)) return (answer.optionIds?.length ?? 0) > 0;
  return (answer.text ?? "").trim().length > 0;
}

/**
 * A carga tem a FORMA do tipo da pergunta?
 *
 * Conferido antes da obrigatoriedade, e de propósito: texto mandado a uma
 * pergunta de escala não conta como "respondida", então uma checagem feita
 * depois faria a resposta do usuário ser descartada em silêncio. Melhor
 * recusar e dizer o que está errado.
 */
function validateShape(
  question: FormQuestionDraft,
  answer: FormAnswerInput,
): string | null {
  const hasText = answer.text !== undefined;
  const hasNumber = answer.number !== undefined;
  const hasOptions = (answer.optionIds?.length ?? 0) > 0;

  switch (question.kind) {
    case "TEXTO_CURTO":
    case "PARAGRAFO":
      return hasNumber || hasOptions ? `"${question.label}" espera texto.` : null;
    case "ESCALA_LINEAR":
      return hasText || hasOptions
        ? `"${question.label}" espera um valor da escala.`
        : null;
    default:
      return hasText || hasNumber ? `"${question.label}" espera uma opção.` : null;
  }
}

/** Regras de valor, já sabendo que a forma está certa e há resposta. */
function validateValue(
  question: FormQuestionDraft,
  answer: FormAnswerInput,
): string | null {
  if (question.kind === "ESCALA_LINEAR") {
    const value = answer.number as number;
    if (!Number.isInteger(value)) {
      return `"${question.label}" aceita apenas valores inteiros.`;
    }
    const min = question.scaleMin ?? 1;
    const max = question.scaleMax ?? 5;
    if (value < min || value > max) {
      return `"${question.label}" aceita valores de ${min} a ${max}.`;
    }
    return null;
  }

  if (KINDS_WITH_OPTIONS.includes(question.kind)) {
    const chosen = answer.optionIds ?? [];
    const valid = new Set(question.options.map((o) => o.id));
    if (chosen.some((id) => !valid.has(id))) {
      return `Opção inválida em "${question.label}".`;
    }
    // Só as caixas aceitam mais de uma; escolha única e lista aceitam uma.
    if (question.kind !== "CAIXAS_SELECAO" && chosen.length > 1) {
      return `"${question.label}" aceita apenas uma opção.`;
    }
  }

  return null;
}

function validateOne(
  question: FormQuestionDraft,
  answer: FormAnswerInput | undefined,
): string | null {
  if (answer) {
    const shape = validateShape(question, answer);
    if (shape) return shape;
  }

  const answered = isQuestionAnswered(question, answer);
  if (question.required && !answered) {
    return `Responda "${question.label}".`;
  }
  if (!answer || !answered) return null;

  return validateValue(question, answer);
}

export function validateSubmission(
  form: FormDraft,
  answers: readonly FormAnswerInput[],
): ValidationResult {
  const questions = form.sections.flatMap((s) => s.questions);
  const known = new Set(questions.map((q) => q.id));

  const seen = new Set<string>();
  for (const answer of answers) {
    if (!known.has(answer.questionId)) {
      return { ok: false, error: "A resposta não corresponde a este formulário." };
    }
    if (seen.has(answer.questionId)) {
      return { ok: false, error: "Há duas respostas para a mesma pergunta." };
    }
    seen.add(answer.questionId);
  }

  const byQuestion = new Map(answers.map((a) => [a.questionId, a]));
  for (const question of questions) {
    const problem = validateOne(question, byQuestion.get(question.id));
    if (problem) return { ok: false, error: problem };
  }

  return { ok: true };
}
