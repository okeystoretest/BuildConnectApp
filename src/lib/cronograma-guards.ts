import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/require-user";
import { resolveAccessibleSlugs, canAccessSlug } from "@/lib/auth/access";
import { resolveAppScope } from "@/lib/app-scope";
import { canEditPost } from "@/lib/cronograma-data";
import type { Role } from "@/types";

/**
 * Guardas das escritas do Cronograma.
 *
 * Moram num módulo SEM "use server" de propósito: exportá-los de
 * `cronograma-actions.ts` os transformaria em endpoints chamáveis pelo
 * navegador. Aqui são funções de servidor comuns, importadas pelas actions do
 * post (`cronograma-actions`) e do roteiro (`ai/script-actions`) — uma regra
 * de autoria só, nos dois lugares.
 */

/** Criar conteúdo é aberto: basta estar autenticado. */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) return { user: null, error: "Sessão expirada. Faça login novamente." };
  return { user, error: null };
}

/**
 * Confere autoria antes de alterar. Retorna erro pronto para a UI quando o
 * usuário não é o autor — a checagem vive aqui, não no componente.
 */
export async function requireAuthor(
  postId: string,
  scopeId: string,
  user: { id: string; role: string },
) {
  const post = await prisma.contentPost.findFirst({
    where: { id: postId, subsectorId: scopeId },
    select: { createdById: true, visibility: true },
  });
  if (!post) return { post: null, error: "Post não encontrado." };
  if (!canEditPost(post.createdById, user.id, user.role as Role)) {
    return {
      post: null,
      error:
        post.visibility === "SHARED"
          ? "Atividade pública: apenas o autor pode alterá-la."
          : "Só o autor do conteúdo pode editá-lo.",
    };
  }
  return { post, error: null };
}

/**
 * Resolve o subsetor que guarda os dados, confirma que a ferramenta está ativa
 * e que o usuário tem acesso ao setor pedido.
 *
 * A checagem de acesso estava só nas páginas: pela action, qualquer usuário
 * autenticado escrevia no cronograma de um setor que nem enxerga no menu.
 */
export async function requireScope(slug: string, user: { id: string; role: string }) {
  const slugs = await resolveAccessibleSlugs(user.id, user.role as Role);
  if (!canAccessSlug(slugs, slug)) {
    return { scope: null, error: "Você não tem acesso a este setor." };
  }

  const scope = await resolveAppScope(slug);
  if (!scope) return { scope: null, error: "Setor não encontrado." };
  if (!scope.scheduleEnabled) {
    return { scope: null, error: "O Cronograma não está habilitado neste setor." };
  }
  return { scope, error: null };
}

/**
 * Revalida os OUTROS setores que compartilham a mesma base.
 *
 * O setor atual é deliberadamente excluído: revalidar a própria rota faz o
 * router do Next renavegar para ela, o que remonta a página e devolve o
 * usuário para a primeira aba. Quem atualiza a tela atual é o
 * `router.refresh()` do componente, que troca os dados sem remontar.
 */
export async function revalidateScope(scopeId: string, currentSlug: string) {
  const sharing = await prisma.subsector.findMany({
    where: { OR: [{ id: scopeId }, { appsSourceId: scopeId }] },
    select: { slug: true },
  });
  for (const row of sharing as Array<{ slug: string }>) {
    if (row.slug !== currentSlug) revalidatePath(`/setores/${row.slug}`);
  }
}
