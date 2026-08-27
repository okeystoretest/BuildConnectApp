"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/require-user";
import { resolveAppScope } from "@/lib/app-scope";
import { toScheduledDate, canEditPost, canDeletePost } from "@/lib/cronograma-data";
import { visibilityForSlug } from "@/lib/cronograma-visibility";
import type { Role } from "@/types";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

/**
 * Escrita do Cronograma.
 *
 * Todo post é gravado no subsetor de ESCOPO — o de origem quando há herança.
 * Marketing e Vendas escrevem na mesma base, então o que separa as agendas não
 * é a tabela, é o ALCANCE do registro:
 *
 * - criado na aba do Marketing → SHARED: entra no calendário de todos;
 * - criado nas demais abas     → PRIVATE: fica só com o autor.
 *
 * Permissões: criar é livre para qualquer usuário autenticado com acesso ao
 * setor. Editar, mudar status e EXCLUIR exigem autoria do registro (Admin tem
 * override). O alcance nasce na criação e não muda depois — mudá-lo faria um
 * post sumir ou aparecer para terceiros sem que ninguém percebesse.
 */

const postSchema = z.object({
  slug: z.string().min(1),
  title: z.string().trim().min(1, "Informe o título do post.").max(120, "Título muito longo."),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida."),
  time: z.string().regex(/^\d{2}:\d{2}$/, "Horário inválido."),
  funnel: z.enum(["TOFU", "MOFU", "BOFU"]),
  format: z.enum(["REEL", "STORY", "FEED", "REEL_FEED", "CARROSSEL", "LIVE"]),
  status: z.enum(["IDEIA", "EM_PRODUCAO", "AGENDADO", "PUBLICADO"]),
  brand: z.enum(["OKEY", "LOV_CLUB"]).optional(),
  platform: z.enum(["INSTAGRAM", "TIKTOK", "YOUTUBE"]).optional(),
  ownerId: z.string().optional(),
  notes: z.string().trim().max(500, "Observação muito longa.").optional(),
});

export type ContentPostInput = z.infer<typeof postSchema>;

/** Criar conteúdo é aberto: basta estar autenticado. */
async function requireUser() {
  const user = await getCurrentUser();
  if (!user) return { user: null, error: "Sessão expirada. Faça login novamente." };
  return { user, error: null };
}

/**
 * Confere autoria antes de alterar. Retorna erro pronto para a UI quando o
 * usuário não é o autor — a checagem vive aqui, não no componente.
 */
async function requireAuthor(postId: string, scopeId: string, user: { id: string; role: string }) {
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
          ? "Atividade do Marketing: apenas o autor pode alterá-la."
          : "Só o autor do conteúdo pode editá-lo.",
    };
  }
  return { post, error: null };
}

/** Resolve o subsetor que guarda os dados e confirma que a ferramenta está ativa. */
async function requireScope(slug: string) {
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
async function revalidateScope(scopeId: string, currentSlug: string) {
  const sharing = await prisma.subsector.findMany({
    where: { OR: [{ id: scopeId }, { appsSourceId: scopeId }] },
    select: { slug: true },
  });
  for (const row of sharing as Array<{ slug: string }>) {
    if (row.slug !== currentSlug) revalidatePath(`/setores/${row.slug}`);
  }
}

export async function createContentPost(input: ContentPostInput): Promise<ActionResult> {
  const { user, error } = await requireUser();
  if (!user) return { ok: false, error: error ?? undefined };

  const parsed = postSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const data = parsed.data;

  const { scope, error: scopeError } = await requireScope(data.slug);
  if (!scope) return { ok: false, error: scopeError ?? undefined };

  const scheduledAt = toScheduledDate(data.date, data.time);
  if (!scheduledAt) return { ok: false, error: "Data ou horário inválidos." };

  try {
    await prisma.contentPost.create({
      data: {
        subsectorId: scope.id,
        title: data.title,
        scheduledAt,
        funnel: data.funnel,
        format: data.format,
        status: data.status,
        brand: data.brand ?? null,
        platform: data.platform ?? null,
        notes: data.notes || null,
        ownerId: data.ownerId || null,
        createdById: user.id,
        // Alcance derivado da aba de origem — nunca vem do cliente.
        visibility: visibilityForSlug(data.slug),
        originSlug: data.slug,
      },
    });
    await revalidateScope(scope.id, data.slug);
    return { ok: true };
  } catch (e) {
    console.error("[createContentPost] db:", e);
    return { ok: false, error: "Falha ao salvar o post." };
  }
}

export async function updateContentPost(
  input: ContentPostInput & { id: string },
): Promise<ActionResult> {
  const { user, error } = await requireUser();
  if (!user) return { ok: false, error: error ?? undefined };

  const parsed = postSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  if (!input.id) return { ok: false, error: "Post não informado." };
  const data = parsed.data;

  const { scope, error: scopeError } = await requireScope(data.slug);
  if (!scope) return { ok: false, error: scopeError ?? undefined };

  const scheduledAt = toScheduledDate(data.date, data.time);
  if (!scheduledAt) return { ok: false, error: "Data ou horário inválidos." };

  const { error: authorError } = await requireAuthor(input.id, scope.id, user);
  if (authorError) return { ok: false, error: authorError };

  try {
    // O filtro por subsectorId impede editar post de outro escopo pela action.
    // `visibility` e `originSlug` ficam de fora: alcance não se edita.
    const result = await prisma.contentPost.updateMany({
      where: { id: input.id, subsectorId: scope.id },
      data: {
        title: data.title,
        scheduledAt,
        funnel: data.funnel,
        format: data.format,
        status: data.status,
        brand: data.brand ?? null,
        platform: data.platform ?? null,
        notes: data.notes || null,
        ownerId: data.ownerId || null,
      },
    });
    if (result.count === 0) return { ok: false, error: "Post não encontrado." };

    await revalidateScope(scope.id, data.slug);
    return { ok: true };
  } catch (e) {
    console.error("[updateContentPost] db:", e);
    return { ok: false, error: "Falha ao atualizar o post." };
  }
}

/** Mudança rápida de status direto no backlog. */
export async function setContentPostStatus(input: {
  id: string;
  slug: string;
  status: "IDEIA" | "EM_PRODUCAO" | "AGENDADO" | "PUBLICADO";
}): Promise<ActionResult> {
  const { user, error } = await requireUser();
  if (!user) return { ok: false, error: error ?? undefined };

  const { scope, error: scopeError } = await requireScope(input.slug);
  if (!scope) return { ok: false, error: scopeError ?? undefined };

  const { error: authorError } = await requireAuthor(input.id, scope.id, user);
  if (authorError) return { ok: false, error: authorError };

  try {
    const result = await prisma.contentPost.updateMany({
      where: { id: input.id, subsectorId: scope.id },
      data: { status: input.status },
    });
    if (result.count === 0) return { ok: false, error: "Post não encontrado." };

    await revalidateScope(scope.id, input.slug);
    return { ok: true };
  } catch (e) {
    console.error("[setContentPostStatus] db:", e);
    return { ok: false, error: "Falha ao atualizar o status." };
  }
}

/** Excluir: dono do card ou Admin. */
export async function deleteContentPost(input: {
  id: string;
  slug: string;
}): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sessão expirada. Faça login novamente." };

  const { scope, error: scopeError } = await requireScope(input.slug);
  if (!scope) return { ok: false, error: scopeError ?? undefined };

  const post = await prisma.contentPost.findFirst({
    where: { id: input.id, subsectorId: scope.id },
    select: { createdById: true },
  });
  if (!post) return { ok: false, error: "Post não encontrado." };

  if (!canDeletePost(post.createdById, user.id, user.role as Role)) {
    return { ok: false, error: "Apenas o autor do conteúdo ou um administrador pode excluí-lo." };
  }

  try {
    const result = await prisma.contentPost.deleteMany({
      where: { id: input.id, subsectorId: scope.id },
    });
    if (result.count === 0) return { ok: false, error: "Post não encontrado." };

    await revalidateScope(scope.id, input.slug);
    return { ok: true };
  } catch (e) {
    console.error("[deleteContentPost] db:", e);
    return { ok: false, error: "Falha ao excluir o post." };
  }
}
