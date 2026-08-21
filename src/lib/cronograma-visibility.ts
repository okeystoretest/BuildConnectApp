import type { ContentVisibility } from "@/types/cronograma";

/**
 * Regra de alcance do Cronograma — ponto único.
 *
 * Marketing e Vendas compartilham a MESMA base (`appsSource`), então quem
 * define a natureza do registro é a aba em que ele foi criado:
 *
 * - Criado na aba do Marketing  → SHARED: entra na agenda de todo mundo.
 *   Vendas enxerga, filtra e exporta, mas não edita nem exclui — só o autor
 *   (e o Admin) alteram.
 * - Criado em qualquer outra aba → PRIVATE: é a agenda pessoal de quem criou.
 *   Ninguém mais vê, nem outro usuário de Vendas.
 *
 * Trocar essa política é trocar esta função — nem a action nem a leitura
 * decidem alcance por conta própria.
 */

export const MARKETING_SLUG = "marketing";

/** Alcance de um post criado a partir da aba `slug`. */
export function visibilityForSlug(slug: string): ContentVisibility {
  return slug === MARKETING_SLUG ? "SHARED" : "PRIVATE";
}

export const VISIBILITY_LABEL: Record<ContentVisibility, string> = {
  SHARED: "Marketing · visível para todos",
  PRIVATE: "Somente eu",
};

export const VISIBILITY_HINT: Record<ContentVisibility, string> = {
  SHARED:
    "Atividade do Marketing: aparece no calendário de todos os setores que compartilham esta base. Apenas o autor pode alterá-la.",
  PRIVATE: "Atividade pessoal: só quem criou consegue ver, editar ou excluir.",
};
