import { resolveBrand } from "@/lib/funnel";
import type { ContentBrand } from "@/types/cronograma";

/**
 * Recorte por marca do Cronograma — ponto único.
 *
 * Duas regras que não são óbvias e por isso moram aqui, e não espalhadas pelo
 * painel:
 *
 * 1. Seleção vazia não é "esconder tudo", é "não filtrar". O filtro nasce
 *    vazio, e nesse estado a tela precisa mostrar o mês inteiro.
 *
 * 2. Card SEM marca é permanente. Ele não pertence a nenhuma marca, então
 *    nenhum recorte por marca deveria fazê-lo sumir — quem filtra por OKEY
 *    quer ver OKEY *e* o que ainda não foi atribuído, não perder metade da
 *    agenda sem perceber.
 *
 * O valor de `brand` chega do banco como string livre; `resolveBrand` é quem
 * decide se aquilo é uma marca conhecida. Qualquer coisa que ele não reconheça
 * conta como "sem marca" e permanece visível.
 */
export function matchesBrand(
  brand: unknown,
  selected: readonly ContentBrand[],
): boolean {
  if (selected.length === 0) return true;

  const key = resolveBrand(brand);
  if (key === null) return true;

  return selected.includes(key);
}
