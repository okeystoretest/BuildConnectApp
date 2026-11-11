"use server";

import crypto from "node:crypto";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/require-user";
import { canAdministerDho } from "@/lib/auth/access";
import { storeFile, removeFile, FileStorageError } from "@/lib/storage/files";
import { resolveSafePath, segmentsFromPublicPath } from "@/lib/storage/stream-file";
import { accessDeadline } from "./access";
import { getGuestAttempts } from "./admin-data";
import { readQuestions, saveQuestionsFor } from "./questions-core";
import type { Role } from "@/types";
import type {
  GuestAttemptDetail,
  QuestionDraft,
  SaveQuestionsResult,
} from "@/types/integration";

/**
 * Gestão da Página de Integração, do lado do DHO.
 *
 * Quem entra: quem ADMINISTRA o DHO — o Admin e o Gestor lotado no DHO. A
 * mesma régua das outras abas de gestão do setor. O Colaborador do DHO não
 * gera link nem lê resposta de convidado.
 *
 * A guarda se repete em cada action, e isso não é descuido: Server Action é
 * um endpoint. Proteger só a página deixaria a action alcançável por quem
 * montar a chamada à mão.
 */

export interface AdminResult {
  ok: boolean;
  error?: string;
  /** createLink: o token recém-gerado, para a tela montar o link. */
  token?: string;
}

async function requireDhoAdmin(): Promise<{ id: string } | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  if (!(await canAdministerDho(user.id, user.role as Role))) return null;
  return { id: user.id };
}

const NEGADO = "As ferramentas do DHO são exclusivas de quem administra o setor.";

/**
 * Apaga do disco o arquivo de um caminho PÚBLICO (/uploads/...).
 *
 * `removeFile` recebe caminho absoluto; o banco guarda o público. A conversão
 * passa por `resolveSafePath`, que é a mesma barreira contra travessia usada
 * para servir — um caminho adulterado no banco não apaga fora da raiz.
 */
async function removeStoredFile(publicPath: string): Promise<void> {
  const absolute = resolveSafePath(segmentsFromPublicPath(publicPath));
  if (absolute) await removeFile(absolute);
}

// ─── Convites ──────────────────────────────────────────────────────────────

const guestSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(5, "Informe o nome completo.")
    .max(120, "Nome muito longo.")
    .refine((v) => /\s/.test(v), { message: "Informe nome e sobrenome." }),
  // Só os dígitos importam: `lib/phone` monta o JID a partir deles, e aceitar
  // máscara aqui é o que evita recusar "(11) 99999-0000" digitado à mão.
  phone: z
    .string()
    .trim()
    .transform((v) => v.replace(/\D/g, ""))
    .refine((v) => v.length >= 10 && v.length <= 13, {
      message: "Telefone inválido. Use DDD + número.",
    }),
});

/**
 * Gera um convite pessoal (item 2 do escopo de refatoração).
 *
 * Nome e telefone são OBRIGATÓRIOS: o convite deixou de ser um link solto e
 * passou a apontar para uma pessoa. O telefone é o que permite cobrá-la por
 * WhatsApp quando ela não alcança a nota — sem ele, a regra de reprovação
 * ficaria sem canal.
 *
 * 32 bytes aleatórios no token: adivinhar é a única via sem convite, e ela
 * está fechada pelo tamanho. Não é derivado do nome nem da data — nada nele
 * permite inferir outro.
 */
export async function createIntegrationGuest(input: {
  fullName: string;
  phone: string;
}): Promise<AdminResult> {
  const me = await requireDhoAdmin();
  if (!me) return { ok: false, error: NEGADO };

  const parsed = guestSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Revise os campos." };
  }

  const token = crypto.randomBytes(32).toString("base64url");
  await prisma.integrationGuest.create({
    data: {
      token,
      fullName: parsed.data.fullName,
      phone: parsed.data.phone,
      createdById: me.id,
    },
  });

  revalidatePath("/setores/rh");
  return { ok: true, token };
}

/**
 * Revoga um convite à mão.
 *
 * O que morre é a ENTRADA: as tentativas e as respostas ficam no quadro. A
 * revogação AUTOMÁTICA (trilha concluída com aproveitamento) passa pelo mesmo
 * campo, em `lib/integration/guest-core`.
 *
 * Vale na requisição seguinte, inclusive para quem já está com a página
 * aberta — `resolveGuest` confere `revokedAt` no banco a cada leitura, e não
 * só a assinatura do cookie.
 */
export async function revokeIntegrationGuest(guestId: string): Promise<AdminResult> {
  const me = await requireDhoAdmin();
  if (!me) return { ok: false, error: NEGADO };

  await prisma.integrationGuest.updateMany({
    where: { id: guestId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  revalidatePath("/setores/rh");
  return { ok: true };
}

/** Reabre um convite revogado — inclusive o que se fechou sozinho no fim. */
export async function restoreIntegrationGuest(guestId: string): Promise<AdminResult> {
  const me = await requireDhoAdmin();
  if (!me) return { ok: false, error: NEGADO };

  // Reabrir dá uma janela NOVA. Sem isso, reabrir um convite já concluído não
  // teria efeito: a conclusão é permanente e o prazo antigo fecharia a porta
  // de novo na leitura seguinte.
  await prisma.integrationGuest.update({
    where: { id: guestId },
    data: { revokedAt: null, accessUntil: accessDeadline(new Date()) },
  });

  revalidatePath("/setores/rh");
  return { ok: true };
}

// ─── Peças: filmes, vídeos e documentos ────────────────────────────────────

const assetSchema = z.object({
  kind: z.enum(["FILME", "VIDEO", "DOCUMENTO"]),
  title: z.string().trim().min(2, "Informe o título.").max(160),
  focus: z.string().trim().max(160).optional(),
  lesson: z.string().trim().max(400).optional(),
  order: z.coerce.number().int().min(0).max(999),
});

/** Cria a peça SEM arquivo. O envio do arquivo é o passo seguinte. */
export async function createIntegrationAsset(input: {
  kind: "FILME" | "VIDEO" | "DOCUMENTO";
  title: string;
  focus?: string;
  lesson?: string;
  order: number;
}): Promise<AdminResult> {
  const me = await requireDhoAdmin();
  if (!me) return { ok: false, error: NEGADO };

  const parsed = assetSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Revise os campos." };
  }
  const data = parsed.data;

  await prisma.integrationAsset.create({
    data: {
      kind: data.kind,
      title: data.title,
      focus: data.focus || null,
      lesson: data.lesson || null,
      order: data.order,
    },
  });

  revalidatePath("/setores/rh");
  return { ok: true };
}

export async function updateIntegrationAsset(
  assetId: string,
  input: { title: string; focus?: string; lesson?: string; order: number },
): Promise<AdminResult> {
  const me = await requireDhoAdmin();
  if (!me) return { ok: false, error: NEGADO };

  const parsed = assetSchema.omit({ kind: true }).safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Revise os campos." };
  }
  const data = parsed.data;

  await prisma.integrationAsset.update({
    where: { id: assetId },
    data: {
      title: data.title,
      focus: data.focus || null,
      lesson: data.lesson || null,
      order: data.order,
    },
  });

  revalidatePath("/setores/rh");
  return { ok: true };
}

/**
 * Exclui a peça.
 *
 * O progresso dos convidados que já a concluíram vai junto (cascade), e é o
 * correto: sem o filme, "concluiu o filme" não significa nada. As RESPOSTAS
 * não vão — elas pertencem ao formulário, que sobrevive à exclusão do filme
 * (a FK é SET NULL). Quem quiser apagar as respostas apaga o formulário, na
 * aba de formulários, com o freio digitado que já existe lá.
 */
export async function deleteIntegrationAsset(assetId: string): Promise<AdminResult> {
  const me = await requireDhoAdmin();
  if (!me) return { ok: false, error: NEGADO };

  const asset = await prisma.integrationAsset.findUnique({
    where: { id: assetId },
    select: { filePath: true },
  });

  await prisma.integrationAsset.delete({ where: { id: assetId } });

  // O arquivo sai do disco DEPOIS do banco: se a exclusão falhar, o filme
  // continua de pé com o arquivo no lugar, em vez de aparecer quebrado.
  if (asset?.filePath) {
    await removeStoredFile(asset.filePath);
  }

  revalidatePath("/setores/rh");
  return { ok: true };
}

/**
 * Recebe o arquivo da peça. Chamada pela rota `/api/uploads` (kind
 * `integracao-arquivo`), e não direto da tela: filme passa de 100 MB e Server
 * Action não reporta progresso de envio.
 */
export async function uploadIntegrationAssetFile(formData: FormData): Promise<AdminResult> {
  const me = await requireDhoAdmin();
  if (!me) return { ok: false, error: NEGADO };

  const assetId = String(formData.get("assetId") ?? "");
  const asset = await prisma.integrationAsset.findUnique({
    where: { id: assetId },
    select: { id: true, kind: true, filePath: true },
  });
  if (!asset) return { ok: false, error: "Peça não encontrada." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Selecione um arquivo." };
  }

  // Filme e vídeo passam pela regra de vídeo; documento, pela de documento.
  // É a mesma allowlist de extensão e o mesmo teto do resto do sistema.
  const rule = asset.kind === "DOCUMENTO" ? "document" : "video";

  let stored;
  try {
    stored = await storeFile(file, rule, "conteudo");
  } catch (e) {
    if (e instanceof FileStorageError) return { ok: false, error: e.message };
    console.error("[uploadIntegrationAssetFile] storage:", e);
    return { ok: false, error: "Falha ao enviar o arquivo." };
  }

  try {
    await prisma.integrationAsset.update({
      where: { id: asset.id },
      data: { filePath: stored.publicPath },
    });
  } catch (e) {
    await removeFile(stored.absolutePath);
    console.error("[uploadIntegrationAssetFile] db:", e);
    return { ok: false, error: "Falha ao salvar o arquivo." };
  }

  // O arquivo ANTERIOR só sai depois que o novo está gravado no banco: na
  // ordem inversa, uma falha deixaria a peça sem arquivo nenhum.
  if (asset.filePath) {
    await removeStoredFile(asset.filePath);
  }

  revalidatePath("/setores/rh");
  return { ok: true };
}

// ─── Acompanhamento das respostas ─────────────────────────────────────────

/** As tentativas de um convidado. Guarda própria: Server Action é endpoint. */
export async function fetchGuestAttempts(guestId: string): Promise<GuestAttemptDetail[]> {
  const me = await requireDhoAdmin();
  if (!me) return [];
  return getGuestAttempts(guestId);
}

// ─── Questionário do filme ─────────────────────────────────────────────────

/**
 * As perguntas de um filme, COM gabarito, para o editor do DHO.
 *
 * É o único lugar do sistema que devolve qual alternativa é a correta, e ele
 * exige administrar o DHO. A página do convidado nunca recebe este dado —
 * `getTrail` o deixa de fora de propósito.
 */
export async function fetchFilmQuestions(
  assetId: string,
): Promise<(QuestionDraft & { id: string })[]> {
  const me = await requireDhoAdmin();
  if (!me) return [];
  return (await readQuestions(assetId)).questions;
}

/**
 * Grava o questionário editado.
 *
 * `confirmRemovals` chega verdadeiro só depois de a tela ter mostrado o que
 * se perde. Sem ele, uma edição que apagaria resposta de convidado é recusada
 * com a lista do que sumiria — a mesma mecânica do construtor de formulários.
 */
export async function saveFilmQuestions(
  assetId: string,
  questions: QuestionDraft[],
  confirmRemovals?: boolean,
): Promise<SaveQuestionsResult> {
  const me = await requireDhoAdmin();
  if (!me) return { ok: false, error: NEGADO };

  const res = await saveQuestionsFor(assetId, questions, confirmRemovals === true);
  if (res.ok) revalidatePath("/setores/rh");
  return res;
}
