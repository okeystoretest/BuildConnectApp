import { resolveBrand } from "@/lib/funnel";
import { BROADCAST_SLUG } from "@/lib/cronograma-visibility";
import type { ContentBrand, ContentVisibility } from "@/types/cronograma";

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

/**
 * Recorte por responsável — Gestor e Admin.
 *
 * Seleção vazia é "Geral": mostra tudo. Fora de "Geral", card SEM
 * responsável não casa com ninguém e some — ao contrário do card sem marca,
 * que é permanente. A diferença é de propósito: "só os cards do Fulano" é
 * uma lista de pessoas, e um card que não é de ninguém não está nela.
 */
export function matchesOwner(
  ownerId: string | null | undefined,
  selected: readonly string[],
): boolean {
  if (selected.length === 0) return true;
  return ownerId != null && selected.includes(ownerId);
}

/**
 * Recorte do Colaborador, que não escolhe pessoas: escolhe GRUPOS.
 *
 * - SECTOR    "Setor (aba atual)" → o que colegas criaram nesta aba com
 *                                    alcance Setor ou Público.
 * - MARKETING "Marketing"         → o que o Marketing publicou (Público).
 *
 * Os próprios cards aparecem sempre; cada chip soma um grupo. Nenhum chip
 * ligado = só os próprios. O servidor já entrega apenas a união dos dois
 * grupos mais os próprios (`visibilityWhere`); aqui é só a escolha entre eles.
 */
export type CollabScope = "SECTOR" | "MARKETING";

export interface CollabScopedPost {
  ownerId: string | null | undefined;
  visibility: ContentVisibility;
  originSlug: string | null | undefined;
}

export function matchesCollabScope(
  post: CollabScopedPost,
  viewerId: string,
  slug: string,
  scopes: readonly CollabScope[],
): boolean {
  if (post.ownerId != null && post.ownerId === viewerId) return true;
  if (post.visibility === "PRIVATE") return false;
  if (scopes.includes("SECTOR") && post.originSlug === slug) return true;
  return (
    scopes.includes("MARKETING") &&
    post.visibility === "SHARED" &&
    post.originSlug === BROADCAST_SLUG
  );
}

/**
 * Chips oferecidos ao Colaborador na aba `slug`. Na aba Marketing o chip
 * "Setor" já cobre tudo que "Marketing" traria, então só ele aparece.
 */
export function collabScopesForSlug(slug: string): readonly CollabScope[] {
  return slug === BROADCAST_SLUG ? ["SECTOR"] : ["SECTOR", "MARKETING"];
}

/**
 * Chips ligados ao abrir a aba: os próprios cards mais o que o Marketing
 * publicou. Na aba Marketing esse grupo é o chip "Setor".
 */
export function defaultCollabScopes(slug: string): readonly CollabScope[] {
  return slug === BROADCAST_SLUG ? ["SECTOR"] : ["MARKETING"];
}
