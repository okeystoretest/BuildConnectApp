import { revalidatePath } from "next/cache";
import { resolveAccessibleSlugs, canAccessSlug } from "@/lib/auth/access";
import { can } from "@/lib/permissions";
import { resolveWeeklyScope } from "./data";
import type { Role } from "@/types";

/**
 * Guardas das escritas do Relatório Semanal.
 *
 * Módulo SEM "use server" de propósito: exportá-las de `actions.ts` as
 * transformaria em endpoints chamáveis pelo navegador. Mesma decisão de
 * `sales-funnel/guards.ts` e `cronograma-guards.ts`.
 *
 * Nada aqui lê a sessão — quem lê o cookie é a action. As duas decisões que
 * importam (papel e escopo) recebem o usuário por parâmetro, e é isso que as
 * deixa exercitáveis sozinhas.
 */

/** Aprovar e reabrir a semana é ato de gestão. Preencher não passa por aqui. */
export function requireApprover(user: { role: string }) {
  if (!can(user.role as Role, "weeklyReport.approve")) {
    return { error: "Só Gestor ou Admin pode aprovar ou reabrir o relatório." };
  }
  return { error: null };
}

/** Resolve o subsetor, confirma a ferramenta habilitada e o acesso à área. */
export async function requireWeeklyScope(slug: string, user: { id: string; role: string }) {
  const slugs = await resolveAccessibleSlugs(user.id, user.role as Role);
  if (!canAccessSlug(slugs, slug)) {
    return { scope: null, error: "Você não tem acesso a este setor." };
  }
  const scope = await resolveWeeklyScope(slug);
  if (!scope) {
    return { scope: null, error: "O Relatório Semanal não está habilitado neste setor." };
  }
  return { scope, error: null };
}

/**
 * Revalida a rota do setor.
 *
 * Diferente do Funil, aqui não há base compartilhada a propagar: o relatório
 * é de um subsetor só. Revalidar é o que faz a LISTA refletir um envio ou uma
 * aprovação na próxima navegação — a tela aberta é atualizada pelo
 * `router.refresh()` do componente.
 */
export function revalidateWeekly(slug: string) {
  revalidatePath(`/setores/${slug}`);
}
