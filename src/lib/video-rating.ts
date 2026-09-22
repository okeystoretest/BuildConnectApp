/**
 * Avaliação que o COLABORADOR dá AO VÍDEO — não confundir com a nota de
 * compreensão, que é o Gestor avaliando o colaborador. Esta não entra em
 * média de desempenho nenhuma; serve para descobrir qual vídeo precisa ser
 * refeito.
 *
 * Puro de propósito: a interface e a leitura do Gestor usam as mesmas regras,
 * testadas sem banco.
 */

export const RATING_MIN = 1;
export const RATING_MAX = 5;
export const RATING_COMMENT_MAX = 1000;

/** Os critérios, na ordem em que aparecem na tela. */
export const RATING_CRITERIA = [
  { key: "audio", label: "Qualidade do áudio" },
  { key: "image", label: "Qualidade da imagem" },
  { key: "clarity", label: "Clareza das instruções" },
] as const;

export type RatingCriterion = (typeof RATING_CRITERIA)[number]["key"];

export interface RatingInput {
  audio: number | null;
  image: number | null;
  clarity: number | null;
  comment?: string | null;
}

/**
 * Nada marcado e nada escrito. "Opcional" tem que significar ausência: uma
 * linha com três nulos contaria como avaliação e estragaria o denominador.
 */
export function isEmptyRating(input: RatingInput): boolean {
  const noStars = input.audio == null && input.image == null && input.clarity == null;
  return noStars && !input.comment?.trim();
}

/**
 * Média de uma casa decimal. NULA quando não há valor algum — exibir 0,0 para
 * "ninguém avaliou" diria que o vídeo é péssimo, que é o contrário de não
 * saber.
 */
export function averageOf(values: readonly (number | null)[]): number | null {
  const given = values.filter((v): v is number => v != null);
  if (given.length === 0) return null;
  return Math.round((given.reduce((a, v) => a + v, 0) / given.length) * 10) / 10;
}
