import type { ContentVisibility } from "@/types/cronograma";

/**
 * Regra de alcance do Cronograma — ponto único.
 *
 * Marketing, Vendas e Criação compartilham a MESMA base (`appsSource`), então
 * quem define a natureza do registro é a aba em que ele foi criado:
 *
 * - Criado no Marketing ou na Criação → SHARED: entra na agenda de todo mundo
 *   que compartilha a base. Os demais setores enxergam e filtram, mas não
 *   editam nem excluem — só o autor (e o Admin) alteram.
 * - Criado em qualquer outra aba → PRIVATE: é a agenda pessoal de quem criou.
 *   Ninguém mais vê, nem outro usuário do mesmo subsetor.
 *
 * A Criação entrou nesse conjunto para que o Cronograma de Vendas passe a
 * exibir tanto o que o Marketing quanto o que a Criação produzem. A mudança
 * vale para o que for criado daqui em diante: post da Criação gravado antes
 * disso continua PRIVATE no banco e segue invisível para Vendas.
 *
 * Trocar essa política é trocar esta função — nem a action nem a leitura
 * decidem alcance por conta própria.
 */

/** Abas cujo conteúdo nasce visível para toda a base compartilhada. */
export const SHARED_SLUGS: readonly string[] = ["marketing", "criacao"];

/** Alcance de um post criado a partir da aba `slug`. */
export function visibilityForSlug(slug: string): ContentVisibility {
  return SHARED_SLUGS.includes(slug) ? "SHARED" : "PRIVATE";
}

export const VISIBILITY_LABEL: Record<ContentVisibility, string> = {
  SHARED: "Visível para todos",
  PRIVATE: "Somente eu",
};

export const VISIBILITY_HINT: Record<ContentVisibility, string> = {
  SHARED:
    "Atividade compartilhada: aparece no calendário de todos os setores que compartilham esta base. Apenas o autor pode alterá-la.",
  PRIVATE: "Atividade pessoal: só quem criou consegue ver, editar ou excluir.",
};
