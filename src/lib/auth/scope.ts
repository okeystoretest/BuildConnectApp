/**
 * Quem alcança o dado de avaliação de um colaborador.
 *
 * Quem administra o DHO alcança todo mundo; o Gestor de outro setor, só quem
 * está no próprio setor. A régua vale para as três portas do MESMO dado — o
 * consolidado da rodada, o detalhe da submissão e o catálogo da página — e
 * mora aqui para não ser reescrita, e esquecida, em cada uma delas. Foi
 * exatamente o que aconteceu: a edição tinha o recorte, as duas leituras não.
 *
 * `dhoAdmin` chega resolvido por quem chama (`canAdministerDho`, em
 * `access.ts`): é ADMIN, ou GESTOR lotado no DHO. Antes a régua era a
 * permissão `sector.hr`, que só o ADMIN tem — e o Gestor do DHO ficava preso ao
 * "próprio setor", que é o DHO, ou seja, não alcançava resultado de ninguém.
 *
 * Responde só pelo SETOR. A permissão (`evaluations.view`) é conferida antes e
 * continua sendo — este predicado não a substitui.
 *
 * Sem setor de um lado ou do outro, nega. Vale para o "—" que o DTO usa quando
 * o avaliado não tem setor: ele nunca é igual a um rótulo real, então cai na
 * negativa, que é a resposta certa.
 */
export function canReachSector(input: {
  dhoAdmin: boolean;
  actorSector: string | null;
  subjectSector: string | null;
}): boolean {
  if (input.dhoAdmin) return true;
  if (!input.actorSector || !input.subjectSector) return false;
  return input.actorSector === input.subjectSector;
}
