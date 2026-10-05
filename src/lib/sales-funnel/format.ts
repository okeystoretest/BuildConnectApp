/**
 * Formatação do Funil de Vendas.
 *
 * Os nomes dos meses são declarados AQUI, e não importados do Cronograma, por
 * regra do projeto: nada em `sales-funnel/` depende de `lib/funnel.ts`. A
 * economia de doze strings não paga uma aresta entre os dois módulos, que é
 * justamente o que a separação dos dois funis existe para impedir.
 */

import { taxaEfetiva } from "./math";

const MESES: readonly string[] = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

/** Centavos inteiros → "R$ 50.000,00". */
export function formatarReais(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

/** Número de volume com separador de milhar: 1000 → "1.000". */
export function formatarVolume(valor: number): string {
  return valor.toLocaleString("pt-BR");
}

/**
 * ISO → "Outubro/2026". O funil é de um PERÍODO; o dia exato não informa
 * nada e só ocuparia espaço no card.
 *
 * Usa os componentes UTC porque a data é gravada ao meio-dia justamente para
 * não escorregar de mês na conversão de fuso.
 */
export function formatarData(iso: string): string {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return "—";
  const mes = MESES[data.getUTCMonth()];
  return mes ? `${mes}/${data.getUTCFullYear()}` : "—";
}

/**
 * Percentual em pt-BR: 5 → "5,00%".
 *
 * `toFixed(2)` devolveria "5.00", com ponto — o único número da tela que
 * sairia no formato errado, ao lado de valores em reais já localizados.
 */
export function formatarPercentual(valor: number): string {
  return `${valor.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
}

/**
 * O texto de um campo de porcentagem reescrito como o motor vai lê-lo.
 *
 * Digitar "33,333" produzia um funil calculado com 33,33% e um campo exibindo
 * 33,333: a terceira casa era descartada em silêncio, e a tela passava a
 * contradizer o número ao lado. Chamada ao sair do campo, esta função torna o
 * descarte visível em vez de escondê-lo.
 *
 * Devolve o texto INTACTO quando nada se perde — inclusive enquanto a pessoa
 * digita e o conteúdo ainda é "", "1." ou "-". Normalizar nesses estados
 * apagaria o que está sendo escrito.
 */
export function normalizarPercentualDigitado(texto: string): string {
  if (texto.trim() === "") return texto;
  const valor = Number(texto.replace(",", "."));
  if (!Number.isFinite(valor)) return texto;

  const efetiva = taxaEfetiva(valor);
  if (efetiva === valor) return texto;

  // A vírgula só volta se a pessoa tiver usado vírgula: trocar o separador
  // debaixo de quem digitou ponto é mexer no que não foi pedido.
  const saida = String(efetiva);
  return texto.includes(",") ? saida.replace(".", ",") : saida;
}
