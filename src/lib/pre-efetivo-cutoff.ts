/**
 * Corte do Acompanhamento Pré-Efetivo: decide COMO o ciclo 1 abre, não SE o
 * colaborador pode ser avaliado. Todo colaborador pode ser avaliado.
 *
 *  - Cadastrado a partir de 01/10/2026: "onboarding" — o ciclo 1 espera 7
 *    dias úteis após o cadastro (User.createdAt), como sempre foi.
 *  - Cadastrado antes: o ciclo 1 abre na hora em que a agenda é criada; os
 *    ciclos 2 e 3 seguem o mesmo intervalo de 7 dias úteis após a conclusão
 *    do anterior, com aviso ao Gestor.
 *
 * Meia-noite no horário de Brasília, escrita com o fuso explícito para não
 * depender do TZ do servidor.
 */
export const PRE_EFETIVO_CUTOFF = new Date("2026-10-01T00:00:00-03:00");

/** `true` = segue a espera de onboarding; `false` = ciclo 1 imediato. */
export function isOnboardingSchedule(createdAt: Date): boolean {
  return createdAt.getTime() >= PRE_EFETIVO_CUTOFF.getTime();
}
