import type { Role } from "@/types";
import type { FormStatus } from "@/types/form";

/**
 * Regras do ciclo de vida de um formulário, em forma pura.
 *
 * Ficam aqui, sem Prisma nem React, porque são o que decide quem lê o quê — e
 * porque é o tipo de regra que precisa de teste, não de inspeção visual. As
 * Server Actions e as telas consultam estas funções; nenhuma reimplementa.
 */

/**
 * Estrutura editável.
 *
 * Rascunho: à vontade. Publicado sem resposta: também — corrigir um erro de
 * digitação antes de alguém responder é legítimo. Depois da PRIMEIRA resposta,
 * trava: apagar uma opção deixaria `FormAnswer.optionIds` apontando para o nada
 * e, pior, mudaria o significado do que já foi respondido.
 */
export function canEditStructure(form: {
  status: FormStatus;
  responseCount: number;
}): boolean {
  if (form.status === "ENCERRADO") return false;
  if (form.status === "RASCUNHO") return true;
  return form.responseCount === 0;
}

/**
 * Pode enviar resposta.
 *
 * Exige formulário PUBLICADO e uma atribuição ainda PENDENTE. Encerrar recusa
 * mesmo quem nunca respondeu: é o que congela o resultado para leitura.
 */
export function canRespond(
  form: { status: FormStatus },
  assignment: { status: "PENDENTE" | "CONCLUIDA" } | null,
): boolean {
  if (form.status !== "PUBLICADO") return false;
  return assignment?.status === "PENDENTE";
}

/**
 * Mínimo de respostas para exibir agregado de formulário anônimo.
 *
 * Num setor de duas pessoas, a média É a resposta individual. Sem este piso o
 * anônimo seria anônimo apenas no schema.
 */
export const ANONYMITY_FLOOR = 5;

export function showsAggregate(form: { anonymous: boolean }, responseCount: number): boolean {
  if (!form.anonymous) return true;
  return responseCount >= ANONYMITY_FLOOR;
}

/**
 * Setor sentinela para quem não tem lotação.
 *
 * Filtrar por `ownerSectorId: null` casaria justamente com os formulários
 * corporativos do ADMIN — que o gestor não deve ler. Um id que não existe não
 * casa com nada, que é o comportamento correto.
 */
export const NO_SECTOR = "__sem_setor__";

/**
 * Recorte de leitura, na forma de cláusula `where` do Prisma.
 *
 * Devolve a CLÁUSULA, e não um predicado, de propósito: é a única forma de a
 * regra ser testada e usada no mesmo lugar. Um predicado exigiria filtrar
 * depois de carregar — e aí a consulta teria de repetir a regra por conta
 * própria, com dois lugares para divergir. É a lição do quadro de chamados.
 *
 * ADMIN vê tudo. GESTOR vê só o do próprio setor — a mesma régua que já governa
 * os resultados de avaliação na mesma tela (ver `app/setores/rh/page.tsx`),
 * necessária porque a porta do DHO é papel, não lotação: todo gestor de todo
 * setor entra lá.
 */
export function formScopeFor(viewer: {
  role: Role;
  sectorId: string | null;
}): { ownerSectorId: string } | null | "denied" {
  if (viewer.role === "ADMIN") return null;
  if (viewer.role !== "GESTOR") return "denied";
  return { ownerSectorId: viewer.sectorId ?? NO_SECTOR };
}
