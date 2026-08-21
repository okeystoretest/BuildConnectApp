import { prisma } from "@/lib/db/prisma";
import type { Role } from "@/types";

/**
 * Regras de visibilidade por setor/subsetor (RBAC de conteúdo).
 *
 * - ADMIN: acesso irrestrito. Nunca filtramos nada para ele.
 * - COLABORADOR / GESTOR: enxergam somente os subsetores vinculados no
 *   cadastro. Se nenhum subsetor específico foi marcado, o usuário acessa
 *   TODOS os subsetores do seu setor (comportamento já assumido na UI de
 *   cadastro: "sem seleção, acessa todos os subsetores do setor").
 *
 * A unidade de controle é o `slug` do Subsector, que é exatamente o que
 * aparece nas rotas `/setores/<slug>` e nos itens da navegação. Assim a
 * mesma lista serve para filtrar a sidebar e para barrar acesso direto por
 * URL nas páginas.
 */

/**
 * Resolve o conjunto de slugs de subsetor que o usuário pode acessar.
 * Retorna `null` para ADMIN (acesso total — sem filtro).
 */
export async function resolveAccessibleSlugs(
  userId: string,
  role: Role,
): Promise<string[] | null> {
  if (role === "ADMIN") return null;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      sectorId: true,
      subsectors: { select: { subsector: { select: { slug: true } } } },
    },
  });

  if (!user) return [];

  // Subsetores marcados explicitamente no cadastro.
  const explicit = user.subsectors.map(
    (s: { subsector: { slug: string } }) => s.subsector.slug,
  );
  if (explicit.length > 0) return explicit;

  // Sem seleção: libera todos os subsetores do setor do usuário.
  if (!user.sectorId) return [];
  const all = await prisma.subsector.findMany({
    where: { sectorId: user.sectorId },
    select: { slug: true },
  });
  return all.map((s: { slug: string }) => s.slug);
}

/** Verifica se o usuário pode acessar um subsetor específico pelo slug. */
export function canAccessSlug(slugs: string[] | null, slug: string): boolean {
  // `null` = ADMIN (acesso total).
  return slugs === null || slugs.includes(slug);
}
