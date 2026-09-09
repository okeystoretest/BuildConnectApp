import { cache } from "react";
import { prisma } from "@/lib/db/prisma";
import type { Role } from "@/types";

/**
 * Slug do setor DHO. Mantém o "rh" original — a renomeação foi só de rótulo, e
 * o slug é a chave da rota (/setores/rh), do vínculo já gravado e do RBAC.
 */
export const DHO_SLUG = "rh";

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

/**
 * O usuário é do DHO?
 *
 * Verdadeiro quando o setor de lotação é o DHO, ou quando o subsetor `rh` está
 * marcado no cadastro. As duas formas valem porque o DHO é um setor transversal
 * — ele aparece nos dois lugares dependendo de como a pessoa foi cadastrada.
 *
 * Consulta ao BANCO, e não ao cookie. `session.sector` é um rótulo e é uma
 * fotografia do login: mover alguém de setor não invalida a sessão, então o
 * cookie continuaria afirmando a lotação antiga até o próximo login — e esta
 * resposta decide acesso.
 *
 * `cache` do React memoiza por requisição: o layout (que monta a barra
 * lateral) e a página do DHO perguntam a mesma coisa e pagam uma consulta só.
 */
export const isDhoMember = cache(async (userId: string): Promise<boolean> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      sector: { select: { slug: true } },
      subsectors: { select: { subsector: { select: { slug: true } } } },
    },
  });
  if (!user) return false;

  if (user.sector?.slug === DHO_SLUG) return true;
  return user.subsectors.some(
    (s: { subsector: { slug: string } }) => s.subsector.slug === DHO_SLUG,
  );
});

/**
 * Quem alcança as ferramentas do DHO: avaliações, formulários, gestão de
 * usuários, denúncias, documentos e mapas de integração.
 *
 * Só quem é do DHO — em qualquer papel — e o ADMIN, que mantém passe livre
 * como em todo o resto do sistema. Um Gestor de outro setor NÃO entra, mesmo
 * tendo `evaluations.view` ou `forms.manage`: a permissão diz o que o papel
 * sabe fazer, este predicado diz de quem é a ferramenta.
 */
export async function canUseDhoTools(userId: string, role: Role): Promise<boolean> {
  if (role === "ADMIN") return true;
  return isDhoMember(userId);
}
