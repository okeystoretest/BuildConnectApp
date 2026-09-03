import type { Role } from "@/types";
import type { FormDraft, FormStatus } from "@/types/form";

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
 * Rascunho e publicado: sim, mesmo com respostas já gravadas. Encerrado: não —
 * é resultado congelado, e editá-lo mudaria o significado de um número que
 * alguém já leu. Para mexer num encerrado, reabra: a rodada nova é o lugar onde
 * estrutura nova faz sentido.
 *
 * **Mudou em 03/09/2026, a pedido.** Antes, a primeira resposta travava a
 * estrutura. A proteção não sumiu — mudou de lugar: em vez de recusar a edição,
 * `removalImpact` diz exatamente o que será destruído e a tela pergunta antes
 * de gravar. Quem grava é `saveForm`, que atualiza pergunta por pergunta em vez
 * de apagar e recriar, para que o que não foi mexido conserve as respostas.
 */
export function canEditStructure(form: { status: FormStatus }): boolean {
  return form.status !== "ENCERRADO";
}

/** Reabrir só faz sentido para o que está encerrado. */
export function canReopen(form: { status: FormStatus }): boolean {
  return form.status === "ENCERRADO";
}

/** Um item que some do formulário levando dado junto. */
export interface RemovalImpact {
  kind: "pergunta" | "opção";
  id: string;
  label: string;
  /** Respostas destruídas (pergunta) ou que ficam órfãs (opção). */
  affected: number;
}

/**
 * O que salvar este rascunho vai DESTRUIR.
 *
 * Compara o que está no banco com o que a tela devolve e devolve só o que sai
 * levando dado junto. É a conta que substituiu a antiga trava de edição, e é a
 * única coisa entre o usuário e uma perda silenciosa.
 *
 * Só entra na lista o que tem `affected > 0`: apagar uma pergunta que ninguém
 * respondeu não perde nada, e avisar sobre isso seria ruído — ruído faz o aviso
 * que importa ser ignorado.
 *
 * Compara por ID, nunca por rótulo: renomear uma pergunta é edição legítima e
 * não pode ser lida como "apagou uma e criou outra".
 */
export function removalImpact(
  existing: {
    questions: readonly { id: string; label: string; answers: number }[];
    options: readonly { id: string; label: string; chosen: number }[];
  },
  draft: FormDraft,
): RemovalImpact[] {
  const questions = draft.sections.flatMap((s) => s.questions);
  const keptQuestions = new Set(questions.map((q) => q.id));
  const keptOptions = new Set(questions.flatMap((q) => q.options.map((o) => o.id)));

  // Perguntas primeiro: perder uma pergunta é mais grave que perder uma opção,
  // e a tela lista na ordem recebida.
  return [
    ...existing.questions
      .filter((q) => !keptQuestions.has(q.id) && q.answers > 0)
      .map((q): RemovalImpact => ({
        kind: "pergunta",
        id: q.id,
        label: q.label,
        affected: q.answers,
      })),
    ...existing.options
      .filter((o) => !keptOptions.has(o.id) && o.chosen > 0)
      .map((o): RemovalImpact => ({
        kind: "opção",
        id: o.id,
        label: o.label,
        affected: o.chosen,
      })),
  ];
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
