/**
 * O que cada nota da escala QUER DIZER, em palavras.
 *
 * Existe porque um botão "3" não informa nada: quem pontua precisa saber se 3
 * é o meio de "ruim a excelente" ou o meio de "nunca a sempre" — e são coisas
 * diferentes. A legenda aparece abaixo da escala e os botões continuam
 * mostrando o número.
 *
 * NÃO se confunde com `scaleLabels`, que SUBSTITUI o número pelo rótulo no
 * próprio botão (o Desempenho Comportamental faz assim). Um instrumento que já
 * se rotula não recebe legenda daqui: seriam duas definições da mesma escala,
 * livres para divergir.
 */

/** Escala de qualidade: o quão bem a pessoa atende ao critério. */
const QUALIDADE = ["Insatisfatório", "Regular", "Bom", "Muito bom", "Excelente"] as const;

/**
 * Escala de frequência: com que constância o comportamento aparece. É a régua
 * certa onde o critério pergunta "costuma…?", e não "é bom nisso?".
 */
const FREQUENCIA = ["Nunca", "Raramente", "Às vezes", "Quase sempre", "Sempre"] as const;

/** Por slug, porque é o que identifica o instrumento de ponta a ponta. */
const LEGENDS: Record<string, readonly string[]> = {
  "acompanhamento-pre-efetivo": QUALIDADE,
  "eficacia-no-trabalho": FREQUENCIA,
  "inteligencia-emocional": FREQUENCIA,
};

export interface ScaleLegendTarget {
  slug: string;
  scaleMax: number;
  scaleLabels: readonly string[];
}

/**
 * A legenda do instrumento, ou `null` quando não há uma a mostrar — porque ele
 * já se rotula, porque ninguém escreveu uma, ou porque a escala mudou de
 * tamanho e a legenda deixou de cobri-la (mostrar meia legenda é pior que
 * nenhuma: some justo a ponta que a pessoa não conhece).
 */
export function scaleLegendFor(form: ScaleLegendTarget): string[] | null {
  if (form.scaleLabels.length > 0) return null;
  const legend = LEGENDS[form.slug];
  if (!legend || legend.length !== form.scaleMax) return null;
  return [...legend];
}
