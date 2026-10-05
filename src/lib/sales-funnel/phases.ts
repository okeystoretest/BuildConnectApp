/**
 * As três fases do canvas — Atração, Relacionamento, Fechamento — e as siglas
 * ToFu/MoFu/BoFu que o mercado usa para as mesmas três.
 *
 * A fase é DERIVADA da posição da etapa, e não guardada: a primeira etapa é o
 * topo, a última é o fundo, o que estiver no meio é meio. Não há coluna de
 * fase em `SalesFunnelStage` e não deve haver — as etapas são recriadas a cada
 * salvamento, e um campo aqui seria só mais uma coisa a se perder na recriação.
 *
 * As cores e os nomes das siglas são COPIADOS de `src/lib/funnel.ts`, e não
 * importados. A regra dura do projeto é que nada em `sales-funnel/` dependa de
 * `lib/funnel.ts`: aquele arquivo classifica CONTEÚDO do Cronograma em
 * TOFU/MOFU/BOFU, este mede VOLUME comercial, e os dois só coincidem no
 * vocabulário. É a mesma duplicação deliberada dos nomes de mês em
 * `format.ts`. Se alguém trocar isto por um import, os dois domínios passam a
 * ser um só — e não são.
 */

export type FaseFunil = "TOFU" | "MOFU" | "BOFU";

export const ORDEM_FASES: readonly FaseFunil[] = ["TOFU", "MOFU", "BOFU"];

interface FaseMeta {
  /** O nome da fase no canvas impresso, que vai no trilho lateral. */
  fase: string;
  /** A sigla do cronograma, que vai no badge junto da etapa. */
  sigla: string;
  /** Texto do tooltip: o que acontece com o lead nesta fase. */
  descricao: string;
  /** Cor sólida da fase. Fixa em hex para valer nos dois temas. */
  cor: string;
  /**
   * Classe do badge, no mesmo desenho do Cronograma. O tema claro é alcançado
   * por `[.light_&]:` porque o projeto marca o tema claro com a classe `light`
   * no <html>.
   */
  badge: string;
}

export const FASES: Record<FaseFunil, FaseMeta> = {
  TOFU: {
    fase: "Atração",
    sigla: "ToFu",
    descricao: "Topo: atrair quem ainda não conhece.",
    cor: "#3b82f6",
    badge: "border-[#3b82f6]/35 bg-[#3b82f6]/15 text-[#93c5fd] [.light_&]:text-[#1d4ed8]",
  },
  MOFU: {
    fase: "Relacionamento",
    sigla: "MoFu",
    descricao: "Meio: qualificar e aquecer quem respondeu.",
    cor: "#f5a524",
    badge: "border-[#f5a524]/35 bg-[#f5a524]/15 text-[#fcd34d] [.light_&]:text-[#b45309]",
  },
  BOFU: {
    fase: "Fechamento",
    sigla: "BoFu",
    descricao: "Fundo: negociar e fechar a venda.",
    cor: "#ef4444",
    badge: "border-[#ef4444]/35 bg-[#ef4444]/15 text-[#fca5a5] [.light_&]:text-[#b91c1c]",
  },
};

/**
 * A fase de uma etapa, pela posição dela no funil.
 *
 * Índice fora da lista não quebra: o desenho e a lista de etapas chamam isto
 * durante a digitação, quando uma etapa acabou de ser removida e o índice
 * antigo ainda está em voo por um quadro.
 */
export function faseDaEtapa(indice: number, total: number): FaseFunil {
  if (indice <= 0) return "TOFU";
  if (total <= 1 || indice >= total - 1) return "BOFU";
  return "MOFU";
}

/**
 * Rampa de tons do MoFu, do mais claro ao mais escuro.
 *
 * Com seis etapas, quatro caem no meio: uma cor só faria quatro retângulos
 * idênticos, e a divisa entre as etapas sumiria justo onde o funil costuma
 * estrangular. Os tons são do MESMO âmbar, para o olho continuar lendo "isto
 * tudo é relacionamento".
 */
const TONS_MOFU = ["#fbbf4a", "#f5a524", "#e08c12", "#c67608"] as const;

/** A cor da faixa de uma etapa: a da sua fase, variando só dentro do MoFu. */
export function corDaFaixa(indice: number, total: number): string {
  const fase = faseDaEtapa(indice, total);
  if (fase !== "MOFU") return FASES[fase].cor;
  // Posição dentro do meio: a etapa 1 é a primeira do MoFu.
  const posicaoNoMeio = indice - 1;
  return TONS_MOFU[posicaoNoMeio % TONS_MOFU.length] ?? FASES.MOFU.cor;
}

export interface GrupoDeFase {
  fase: FaseFunil;
  /** Índice da primeira etapa do grupo. */
  inicio: number;
  /** Quantas etapas o grupo abrange. */
  quantidade: number;
}

/**
 * As etapas agrupadas por fase, em ordem.
 *
 * O desenho precisa disto para o trilho lateral e para o badge: uma barra de
 * "Relacionamento" com a altura exata das suas faixas diz onde a fase começa e
 * acaba, coisa que três caixas de um terço fixo nunca disseram. E um "MoFu"
 * centrado no grupo evita a mesma sigla repetida quatro vezes na margem.
 *
 * Grupo vazio não entra: com duas etapas não existe meio, e desenhar uma barra
 * de altura zero deixaria um rótulo solto no vão.
 */
export function gruposDeFase(total: number): GrupoDeFase[] {
  const grupos: GrupoDeFase[] = [];
  for (let i = 0; i < total; i += 1) {
    const fase = faseDaEtapa(i, total);
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.fase === fase) ultimo.quantidade += 1;
    else grupos.push({ fase, inicio: i, quantidade: 1 });
  }
  return grupos;
}
