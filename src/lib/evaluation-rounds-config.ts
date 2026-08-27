/**
 * Instrumentos que exigem MÚLTIPLOS avaliadores.
 *
 * Estes não são preenchidos por um gestor sozinho: o DHO abre uma RODADA,
 * define quantos avaliam e designa cada avaliador. O último avaliador da
 * sequência é sempre o próprio avaliado (autoavaliação), liberada quando o
 * feedback dos demais fecha.
 *
 * Este módulo é a fonte única desses slugs — não repita a lista em nenhum
 * outro arquivo.
 */

export const EFICACIA_SLUG = "eficacia-no-trabalho";
export const MATRIZ_DECISAO_SLUG = "matriz-de-decisao";
export const INTELIGENCIA_EMOCIONAL_SLUG = "inteligencia-emocional";

export const MULTI_RATER_SLUGS: readonly string[] = [
  MATRIZ_DECISAO_SLUG,
  EFICACIA_SLUG,
  INTELIGENCIA_EMOCIONAL_SLUG,
] as const;

/** Total mínimo/máximo de avaliadores por rodada, JÁ incluindo a autoavaliação. */
export const MIN_TOTAL_RATERS = 2;
export const MAX_TOTAL_RATERS = 6;

export function isMultiRaterSlug(slug: string): boolean {
  return MULTI_RATER_SLUGS.includes(slug);
}
