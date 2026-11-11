/**
 * A nota do questionário de um filme.
 *
 * Regra, conforme o DHO (28/10/2026): a nota vai de 0 a 10 e aprova a partir
 * de 7. Com as 5 perguntas por filme do material atual, isso dá:
 *
 *     0 erros → 10,0  aprovado
 *     1 erro  →  8,0  aprovado
 *     2 erros →  6,0  REPROVADO → WhatsApp pedindo para rever o filme
 *
 * O "errar duas reprova" do escopo original é CONSEQUÊNCIA deste piso, não uma
 * regra separada — e é por isso que o que está escrito aqui é o piso, e não o
 * número 2. Um filme com outra quantidade de perguntas continua correto
 * sozinho: com 4 perguntas, 1 erro dá 7,5 e ainda aprova; com 3, 1 erro dá
 * 6,67 e reprova.
 *
 * Puro de propósito — sem Prisma, sem React. É a regra que decide se alguém
 * concluiu a integração, e isso se prova com teste.
 */

/** Nota mínima para aprovação, na escala de 0 a 10. */
export const PASS_SCORE = 7;

/** Escala da nota. Mudar aqui muda `PASS_SCORE` junto, por definição. */
export const MAX_SCORE = 10;

/**
 * Nota de 0 a 10, proporcional aos acertos.
 *
 * Sem perguntas a nota é 0, e não 10: um filme sem questionário não se
 * "aprova" por vacuidade — ele conclui por outro caminho (assistir até o
 * fim), e tratar 0/0 como nota cheia deixaria um filme com o questionário
 * ainda não cadastrado aprovando todo mundo em silêncio.
 */
export function scoreOf(correctCount: number, totalCount: number): number {
  if (totalCount <= 0) return 0;
  const limitado = Math.max(0, Math.min(correctCount, totalCount));
  return (limitado / totalCount) * MAX_SCORE;
}

export function isPassing(correctCount: number, totalCount: number): boolean {
  return scoreOf(correctCount, totalCount) >= PASS_SCORE;
}

/** Nota como a tela mostra: uma casa decimal, vírgula ("8,0"). */
export function scoreLabel(correctCount: number, totalCount: number): string {
  return scoreOf(correctCount, totalCount).toFixed(1).replace(".", ",");
}

/**
 * Corrige um envio contra o gabarito.
 *
 * Recebe a estrutura do questionário e o que o convidado marcou, e devolve a
 * contagem — nunca o gabarito. Quem chama grava a tentativa; a correção em si
 * não toca banco e não depende de ordem de pergunta.
 *
 * Pergunta não respondida conta como ERRO, não como anulada: o questionário é
 * obrigatório por inteiro e deixar em branco não pode ser mais barato que
 * arriscar.
 */
export function correctSubmission(
  questions: readonly { id: string; options: readonly { id: string; correct: boolean }[] }[],
  chosen: ReadonlyMap<string, string>,
): { correctCount: number; totalCount: number; passed: boolean } {
  const correctCount = questions.reduce((acertos, question) => {
    const marcada = chosen.get(question.id);
    if (!marcada) return acertos;
    const option = question.options.find((o) => o.id === marcada);
    return option?.correct ? acertos + 1 : acertos;
  }, 0);

  const totalCount = questions.length;
  return { correctCount, totalCount, passed: isPassing(correctCount, totalCount) };
}
