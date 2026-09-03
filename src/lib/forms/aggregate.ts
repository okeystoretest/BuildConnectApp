import { KINDS_WITH_OPTIONS } from "@/types/form";
import type { FormAnswerInput, FormDraft, FormQuestionKind } from "@/types/form";

/**
 * Agregação das respostas para o dashboard.
 *
 * Pura de propósito: recebe o formulário e as respostas já carregadas, e não
 * conhece Prisma. É o que permite testar a contagem, o percentual e a média sem
 * banco — e são justamente essas três contas que ninguém confere no olho.
 */

export interface OptionTally {
  optionId: string;
  label: string;
  count: number;
  /** Percentual sobre QUEM RESPONDEU a pergunta, arredondado. */
  percent: number;
}

export interface QuestionResult {
  questionId: string;
  label: string;
  kind: FormQuestionKind;
  /** Quantas pessoas responderam esta pergunta (opcional pode ficar em branco). */
  answered: number;
  /** Escolha, caixas, lista. Sempre com TODAS as opções, inclusive as zeradas. */
  options?: OptionTally[];
  /** Escala linear. */
  scale?: {
    /** Na ordem scaleMin→scaleMax, com os valores sem resposta zerados. */
    distribution: { value: number; count: number }[];
    /** Média com 2 casas, ou null quando ninguém respondeu. */
    average: number | null;
  };
  /** Texto e parágrafo: as respostas, na ordem de envio. */
  texts?: string[];
}

export function aggregate(
  form: FormDraft,
  responses: readonly { answers: readonly FormAnswerInput[] }[],
): QuestionResult[] {
  const questions = form.sections.flatMap((s) => s.questions);

  return questions.map((question) => {
    const answers = responses
      .map((r) => r.answers.find((a) => a.questionId === question.id))
      .filter((a): a is FormAnswerInput => a !== undefined);

    if (KINDS_WITH_OPTIONS.includes(question.kind)) {
      const respondents = answers.filter((a) => (a.optionIds?.length ?? 0) > 0);
      const counts = new Map<string, number>();
      for (const answer of respondents) {
        for (const id of answer.optionIds ?? []) {
          counts.set(id, (counts.get(id) ?? 0) + 1);
        }
      }
      const total = respondents.length;
      return {
        questionId: question.id,
        label: question.label,
        kind: question.kind,
        answered: total,
        // Opção sem nenhuma marcação continua na lista: "ninguém escolheu" é
        // resultado, e some se a barra não for desenhada.
        options: [...question.options]
          .sort((a, b) => a.order - b.order)
          .map((option) => {
            const count = counts.get(option.id) ?? 0;
            return {
              optionId: option.id,
              label: option.label,
              count,
              // Denominador é quem respondeu a PERGUNTA, não o total de
              // respostas do formulário: pergunta opcional deixada em branco
              // não deve encolher as barras das demais.
              percent: total === 0 ? 0 : Math.round((count / total) * 100),
            };
          }),
      };
    }

    if (question.kind === "ESCALA_LINEAR") {
      const min = question.scaleMin ?? 1;
      const max = question.scaleMax ?? 5;
      const values = answers
        .map((a) => a.number)
        .filter((v): v is number => typeof v === "number");
      const counts = new Map<number, number>();
      for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);

      const distribution: { value: number; count: number }[] = [];
      for (let value = min; value <= max; value += 1) {
        distribution.push({ value, count: counts.get(value) ?? 0 });
      }

      const average =
        values.length === 0
          ? null
          : Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 100) / 100;

      return {
        questionId: question.id,
        label: question.label,
        kind: question.kind,
        answered: values.length,
        scale: { distribution, average },
      };
    }

    const texts = answers.map((a) => (a.text ?? "").trim()).filter((t) => t.length > 0);
    return {
      questionId: question.id,
      label: question.label,
      kind: question.kind,
      answered: texts.length,
      texts,
    };
  });
}
