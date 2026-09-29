/**
 * Formatação do Funil de Vendas.
 *
 * Os nomes dos meses são declarados AQUI, e não importados do Cronograma, por
 * regra do projeto: nada em `sales-funnel/` depende de `lib/funnel.ts`. A
 * economia de doze strings não paga uma aresta entre os dois módulos, que é
 * justamente o que a separação dos dois funis existe para impedir.
 */
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
