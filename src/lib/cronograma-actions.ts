"use server";

import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/require-user";
import { toScheduledDate, canDeletePost } from "@/lib/cronograma-data";
import { defaultVisibilityForSlug } from "@/lib/cronograma-visibility";
import {
  requireAuthor,
  requireScope,
  requireUser,
  revalidateScope,
} from "@/lib/cronograma-guards";
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
  // Seleção múltipla: a mesma peça costuma sair em mais de um formato.
  // `.min(1)` porque a lista, ao contrário da coluna única que existia antes,
  // pode chegar vazia — e post sem formato nenhum não tem tag no calendário.
  formats: z
    .array(z.enum(["REEL", "STORY", "FEED", "CARROSSEL", "LIVE", "OUTRO"]))
    .min(1, "Escolha ao menos um formato.")
    .max(6),
  // Texto livre do formato "Outro". Ignorado (e limpo) quando OUTRO não está
  // entre os escolhidos.
  formatOther: z.string().trim().max(60, "Descrição do formato muito longa.").optional(),
  brand: z.enum(["OKEY", "LOV_CLUB"]).optional(),
  // Alcance escolhido nos botões do formulário. Ausente = o padrão da aba,
  // para que uma chamada antiga não vire um card público sem querer.
  visibility: z.enum(["SHARED", "SECTOR", "PRIVATE"]).optional(),
  // Seleção múltipla: o post pode ir ao ar em mais de uma rede.
  platforms: z.array(z.enum(["INSTAGRAM", "TIKTOK", "YOUTUBE"])).max(3).optional(),
  notes: z.string().trim().max(500, "Observação muito longa.").optional(),
}).superRefine((data, ctx) => {
  // "Outro" sem descrição é um formato sem nome — o card sairia ilegível.
  if (data.formats.includes("OUTRO") && !data.formatOther) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["formatOther"],
      message: "Descreva o formato do conteúdo.",
    });
  }
});

/** Formatos, redes e texto do formato normalizados para o banco. */
function contentFields(data: ContentPostInput) {
  return {
    // Sem duplicatas: as duas listas são conjuntos, não sequências.
    formats: Array.from(new Set(data.formats)),
    platforms: Array.from(new Set(data.platforms ?? [])),
    formatOther: data.formats.includes("OUTRO") ? (data.formatOther ?? null) : null,
  };
}

export type ContentPostInput = z.infer<typeof postSchema>;

export async function createContentPost(input: ContentPostInput): Promise<ActionResult> {
  const { user, error } = await requireUser();
  if (!user) return { ok: false, error: error ?? undefined };

  const parsed = postSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const data = parsed.data;

  const { scope, error: scopeError } = await requireScope(data.slug, user);
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
        // `status` não vem do formulário: o campo saiu de lá e o banco tem
        // @default(IDEIA). Quem muda o status é o seletor do backlog.
        brand: data.brand ?? null,
        ...contentFields(data),
        notes: data.notes || null,
        // Responsável é quem criou. Deixou de ser escolhido a dedo — o
        // formulário não pergunta mais.
        ownerId: user.id,
        createdById: user.id,
        // Alcance escolhido no formulário; sem escolha, o padrão da aba.
        // `originSlug` é o que dá sentido a SECTOR — ele, sim, nunca vem do
        // cliente, senão bastaria forjá-lo para ler a aba dos outros.
        visibility: data.visibility ?? defaultVisibilityForSlug(data.slug),
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

  const { scope, error: scopeError } = await requireScope(data.slug, user);
  if (!scope) return { ok: false, error: scopeError ?? undefined };

  const scheduledAt = toScheduledDate(data.date, data.time);
  if (!scheduledAt) return { ok: false, error: "Data ou horário inválidos." };

  const { error: authorError } = await requireAuthor(input.id, scope.id, user);
  if (authorError) return { ok: false, error: authorError };

  try {
    // O filtro por subsectorId impede editar post de outro escopo pela action.
    //
    // `visibility` passou a ser editável: os botões de alcance aparecem
    // também na edição, e só o autor (ou o Admin) chega a esta tela.
    //
    // Ficam DE FORA, e cada um por um motivo:
    //  - `originSlug`: a aba de origem é fato consumado, não preferência. É
    //    ela que define quem vê um card SECTOR, então reescrevê-la seria
    //    mudar de setor um card alheio;
    //  - `status`: o campo saiu do formulário. Se ele continuasse sendo
    //    gravado a partir daqui, corrigir o título de um post PUBLICADO o
    //    devolveria para "Ideia";
    //  - `ownerId`: editar não rouba a autoria de quem criou.
    const result = await prisma.contentPost.updateMany({
      where: { id: input.id, subsectorId: scope.id },
      data: {
        title: data.title,
        scheduledAt,
        funnel: data.funnel,
        brand: data.brand ?? null,
        ...contentFields(data),
        notes: data.notes || null,
        ...(data.visibility ? { visibility: data.visibility } : {}),
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

  const { scope, error: scopeError } = await requireScope(input.slug, user);
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

  const { scope, error: scopeError } = await requireScope(input.slug, user);
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
