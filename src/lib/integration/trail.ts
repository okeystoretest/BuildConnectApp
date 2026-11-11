import type { FilmState } from "@/types/integration";

/**
 * A trilha trancada da Página de Integração.
 *
 * Regra única: o filme está CONCLUÍDO quando existe linha de progresso dele
 * para este convidado; está LIBERADO quando o ANTERIOR está concluído; e o
 * primeiro é sempre liberado. Qualquer outro, TRANCADO.
 *
 * Puro de propósito — sem Prisma, sem React. Isto é o que decide o que o
 * convidado alcança, e decisão de acesso se prova com teste, não com clique.
 *
 * Um filme sem arquivo NÃO destrava o resto sozinho: ele continua liberado (o
 * convidado vê que existe), mas sem conclusão a trilha para ali. É o
 * comportamento correto — avançar por cima de um filme que ninguém assistiu
 * esvaziaria a trilha inteira no primeiro upload esquecido.
 */
export function filmStates(
  films: readonly { id: string }[],
  concludedIds: ReadonlySet<string>,
): FilmState[] {
  let previousConcluded = true;
  return films.map((film) => {
    const concluded = concludedIds.has(film.id);
    const state: FilmState = concluded
      ? "CONCLUIDO"
      : previousConcluded
        ? "LIBERADO"
        : "TRANCADO";
    previousConcluded = concluded;
    return state;
  });
}

/**
 * Este convidado pode responder/concluir ESTE filme agora?
 *
 * É a mesma conta de `filmStates`, e é de propósito que a tela e o servidor
 * passem pela mesma função: a tela esconde o filme trancado, mas a Server
 * Action recebe o que o cliente mandar — inclusive de um cliente que não é a
 * tela. Sem esta checagem no servidor, bastava forjar o id do 4º filme para
 * pular a trilha inteira.
 */
export function canConclude(
  films: readonly { id: string }[],
  concludedIds: ReadonlySet<string>,
  assetId: string,
): boolean {
  const index = films.findIndex((f) => f.id === assetId);
  if (index < 0) return false;
  return filmStates(films, concludedIds)[index] === "LIBERADO";
}
