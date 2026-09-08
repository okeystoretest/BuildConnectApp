import { can } from "@/lib/permissions";
import type { Role } from "@/types";

/**
 * Quem alcança o dado de avaliação de um colaborador.
 *
 * `sector.hr` (DHO/Admin) alcança todo mundo; o Gestor, só quem está no
 * próprio setor. A régua vale para as três portas do MESMO dado — o
 * consolidado da rodada, o detalhe da submissão e o catálogo da página — e
 * mora aqui para não ser reescrita, e esquecida, em cada uma delas. Foi
 * exatamente o que aconteceu: a edição tinha o recorte, as duas leituras não.
 *
 * Responde só pelo SETOR. A permissão (`evaluations.view`) é conferida antes e
 * continua sendo — este predicado não a substitui.
 *
 * Sem setor de um lado ou do outro, nega. Vale para o "—" que o DTO usa quando
 * o avaliado não tem setor: ele nunca é igual a um rótulo real, então cai na
 * negativa, que é a resposta certa.
 */
export function canReachSector(input: {
  role: Role;
  actorSector: string | null;
  subjectSector: string | null;
}): boolean {
  if (can(input.role, "sector.hr")) return true;
  if (!input.actorSector || !input.subjectSector) return false;
  return input.actorSector === input.subjectSector;
}
