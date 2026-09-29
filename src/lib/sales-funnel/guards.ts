import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { resolveAccessibleSlugs, canAccessSlug } from "@/lib/auth/access";
import { resolveAppScope } from "@/lib/app-scope";
import { can } from "@/lib/permissions";
import type { Role } from "@/types";

/**
 * Guardas das escritas do Funil de Vendas.
 *
 * Módulo SEM "use server" de propósito: exportá-las de `actions.ts` as
 * transformaria em endpoints chamáveis pelo navegador. Aqui são funções de
 * servidor comuns — a mesma decisão de `cronograma-guards.ts`.
 *
 * Nada aqui resolve a SESSÃO. Quem lê o cookie é a action, porque
 * `getCurrentUser` passa por `cache()` do React e arrastaria o módulo inteiro
 * para dentro do contexto de requisição — deixando as guardas sem como serem
 * testadas contra o banco. As duas decisões que importam (papel e escopo)
 * recebem o usuário por parâmetro e são exercitáveis sozinhas.
 */

/**
 * Editar meta e taxas é ato de gestão: o número que a equipe inteira passa a
 * perseguir. Ver o funil não passa por aqui — basta acesso ao setor.
 */
export function requireFunnelManager(user: { role: string }) {
  if (!can(user.role as Role, "funnel.manage")) {
    return { error: "Só Gestor ou Admin pode alterar o funil." };
  }
  return { error: null };
}

/** Resolve o escopo, confirma a ferramenta ativa e o acesso ao setor. */
export async function requireFunnelScope(slug: string, user: { id: string; role: string }) {
  const slugs = await resolveAccessibleSlugs(user.id, user.role as Role);
  if (!canAccessSlug(slugs, slug)) {
    return { scope: null, error: "Você não tem acesso a este setor." };
  }
  const scope = await resolveAppScope(slug);
  if (!scope) return { scope: null, error: "Setor não encontrado." };
  if (!scope.funnelEnabled) {
    return { scope: null, error: "O Funil de Vendas não está habilitado neste setor." };
  }
  return { scope, error: null };
}

/**
 * Revalida os OUTROS setores que compartilham a base. O atual fica de fora:
 * revalidar a própria rota remonta a página e devolve o usuário à primeira
 * aba — quem atualiza a tela é o `router.refresh()` do componente.
 */
export async function revalidateFunnelScope(scopeId: string, currentSlug: string) {
  const sharing = await prisma.subsector.findMany({
    where: { OR: [{ id: scopeId }, { appsSourceId: scopeId }] },
    select: { slug: true },
  });
  for (const row of sharing as Array<{ slug: string }>) {
    if (row.slug !== currentSlug) revalidatePath(`/setores/${row.slug}`);
  }
}
