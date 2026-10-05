/**
 * O plano de ação: volume do período traduzido em atividade cobrável.
 *
 * A metodologia do canvas termina aqui. O vendedor controla as CAUSAS — quantas
 * oportunidades abre, quantas visitas faz, quantas propostas manda — e não o
 * efeito, que é o fechamento. Uma meta de R$ 75.000 não é acionável; "cinco
 * oportunidades por dia" é.
 *
 * Mora fora de `math.ts` porque o motor não precisa conhecer vendedores para
 * calcular funil nenhum: o funil se resolve inteiro sem equipe declarada, e a
 * equipe só divide o resultado. Separados, cada um se testa sozinho — e o
 * motor, que já está no tamanho dele, não cresce.
 *
 * O arredondamento vem de `arredondar`, do motor, e não de um `Math.round`
 * local: a regra do funil é uma só, e duas cópias dela divergiriam no primeiro
 * empate.
 */

import { arredondar } from "./math";
import type { Equipe, FunnelResult } from "./types";

export interface EsforcoEtapa {
  id: string;
  label: string;
  /** O volume do período inteiro, como o funil calculou. */
  volume: number;
  /** Inteiro cobrável: o número que vai no destaque. */
  porVendedor: number;
  /** O mesmo valor sem arredondar, com duas casas. Vai na nota, ao lado. */
  porVendedorExato: number;
  porVendedorDia: number;
  porVendedorDiaExato: number;
}

/** Duas casas: 5,0568 por dia é ruído; 5,06 é a conferência do número ao lado. */
function duasCasas(valor: number): number {
  return Math.round(valor * 100) / 100;
}

/** Equipe utilizável: positiva e finita nos dois campos. */
function valida(equipe: Equipe | null): equipe is Equipe {
  return (
    equipe !== null &&
    Number.isFinite(equipe.vendedores) &&
    Number.isFinite(equipe.diasUteis) &&
    equipe.vendedores > 0 &&
    equipe.diasUteis > 0
  );
}

/**
 * O esforço de cada etapa, por vendedor e por vendedor por dia.
 *
 * Devolve `null` — e não lista vazia — em dois casos: equipe não declarada ou
 * inválida, e funil que não pôde ser calculado. São as duas situações em que a
 * tela não desenha o bloco, e um só teste na chamada basta para as duas.
 *
 * O inteiro e o exato saem juntos de propósito. Uma visita e dois terços por
 * dia arredondada para duas daria 2 × 4 × 22 = 176 visitas contra as 147 que o
 * funil pede; o exato ao lado é o que impede a conta errada de parecer certa.
 */
export function planoDeAcao(
  resultado: FunnelResult,
  equipe: Equipe | null,
): EsforcoEtapa[] | null {
  if (!valida(equipe)) return null;
  if (resultado.stages.length === 0) return null;

  const porDia = equipe.vendedores * equipe.diasUteis;

  return resultado.stages.map((stage) => ({
    id: stage.id,
    label: stage.label,
    volume: stage.volume,
    porVendedor: arredondar(stage.volume, equipe.vendedores),
    porVendedorExato: duasCasas(stage.volume / equipe.vendedores),
    porVendedorDia: arredondar(stage.volume, porDia),
    porVendedorDiaExato: duasCasas(stage.volume / porDia),
  }));
}

/**
 * A alavanca "aumente a boca do funil", no sentido inverso: quantas
 * oportunidades por vendedor por dia viram quantas prospecções no período.
 *
 * É a simulação 1 do canvas. Seis por vendedor por dia, 22 dias úteis, 4
 * vendedores dão os 528 do exemplo impresso.
 *
 * `null` quando não há equipe ou a atividade não é positiva: sem isso o cenário
 * cairia num topo zero, que `calcularDescendente` trata como erro de volume
 * quando o erro real é outro — falta equipe declarada.
 */
export function topoPorAtividade(
  oportunidadesPorVendedorDia: number,
  equipe: Equipe | null,
): number | null {
  if (!valida(equipe)) return null;
  if (!Number.isFinite(oportunidadesPorVendedorDia) || oportunidadesPorVendedorDia <= 0) {
    return null;
  }
  return arredondar(oportunidadesPorVendedorDia * equipe.vendedores * equipe.diasUteis, 1);
}
