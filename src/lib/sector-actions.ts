"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/require-user";
import { can } from "@/lib/permissions";
import type { Role } from "@/types";
import { processAndStoreImage, ImageProcessingError } from "@/lib/storage/images";
import {
  storeFile,
  removeFile,
  extractTranscriptText,
  FileStorageError,
} from "@/lib/storage/files";
import { toAbsolutePath } from "@/lib/storage/config";
import { resolveAppScope } from "@/lib/app-scope";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

/** Mapeia MIME de documento para o enum FileKind do schema. */
function docKind(mime: string): "PDF" | "DOCX" | "XLSX" | "PNG" {
  if (mime === "application/pdf") return "PDF";
  if (mime.includes("wordprocessing") || mime === "application/msword") return "DOCX";
  if (mime.includes("spreadsheet") || mime === "application/vnd.ms-excel") return "XLSX";
  return "PNG";
}

async function requireUploader() {
  const user = await getCurrentUser();
  if (!user) return { user: null, error: "Sessão expirada. Faça login novamente." };
  if (!can(user.role as Role, "content.upload")) {
    return { user: null, error: "Você não tem permissão para enviar conteúdo." };
  }
  return { user, error: null };
}

/** Ações destrutivas de atalho (editar/excluir) são exclusivas de Admin. */
async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return { user: null, error: "Sessão expirada. Faça login novamente." };
  if ((user.role as Role) !== "ADMIN") {
    return { user: null, error: "Apenas administradores podem gerenciar os aplicativos." };
  }
  return { user, error: null };
}

async function subsectorIdFromSlug(slug: string): Promise<string | null> {
  const sub = await prisma.subsector.findUnique({ where: { slug }, select: { id: true } });
  return sub?.id ?? null;
}

/**
 * Aplicativos são gravados no subsetor de ESCOPO. Com herança ativa, criar um
 * atalho em Marketing grava na base de Vendas — os dois enxergam a mesma lista.
 */
async function appScopeIdFromSlug(slug: string): Promise<string | null> {
  const scope = await resolveAppScope(slug);
  return scope?.id ?? null;
}

// ──────────────────────────────────────────────
// Progresso: marcar/desmarcar conteúdo concluído
// ──────────────────────────────────────────────

const progressSchema = z.object({
  type: z.enum(["video", "document"]),
  id: z.string().min(1),
  done: z.boolean(),
});

export async function setContentProgress(input: {
  type: "video" | "document";
  id: string;
  done: boolean;
}): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sessão expirada. Faça login novamente." };

  const parsed = progressSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Dados inválidos." };
  const { type, id, done } = parsed.data;

  const field = type === "video" ? "videoId" : "documentId";

  try {
    if (done) {
      // Upsert idempotente pela combinação (userId, <tipo>Id).
      await prisma.contentProgress.upsert({
        where:
          type === "video"
            ? { userId_videoId: { userId: user.id, videoId: id } }
            : { userId_documentId: { userId: user.id, documentId: id } },
        update: { completed: true, completedAt: new Date() },
        create: { userId: user.id, [field]: id, completed: true },
      });
    } else {
      await prisma.contentProgress.deleteMany({
        where: { userId: user.id, [field]: id },
      });
    }
    return { ok: true };
  } catch (error) {
    console.error("[setContentProgress] falha:", error);
    return { ok: false, error: "Não foi possível atualizar seu progresso." };
  }
}

// ──────────────────────────────────────────────
// Upload de foto (sharp → .webp)
// ──────────────────────────────────────────────

export async function uploadSectorPhoto(formData: FormData): Promise<ActionResult> {
  const { user, error } = await requireUploader();
  if (!user) return { ok: false, error: error ?? undefined };

  const slug = String(formData.get("slug") ?? "");
  const title = String(formData.get("title") ?? "").trim() || "Foto";
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Selecione uma imagem." };
  }

  const subsectorId = await subsectorIdFromSlug(slug);
  if (!subsectorId) return { ok: false, error: "Setor não encontrado." };

  let stored;
  try {
    stored = await processAndStoreImage(file, "conteudo");
  } catch (e) {
    if (e instanceof ImageProcessingError) return { ok: false, error: e.message };
    console.error("[uploadSectorPhoto] sharp:", e);
    return { ok: false, error: "Falha ao processar a imagem." };
  }

  try {
    const count = await prisma.photo.count({ where: { subsectorId } });
    await prisma.photo.create({
      data: { subsectorId, title, filePath: stored.publicPath, order: count },
    });
    revalidatePath(`/setores/${slug}`);
    return { ok: true };
  } catch (e) {
    await removeFile(stored.absolutePath);
    console.error("[uploadSectorPhoto] db:", e);
    return { ok: false, error: "Falha ao salvar a foto." };
  }
}

// ──────────────────────────────────────────────
// Upload de vídeo / workshop / instrução em vídeo
// ──────────────────────────────────────────────

/**
 * Envia o vídeo e, opcionalmente, seus dois anexos:
 *  - "Instrução Escrita": documento (PDF/DOC/DOCX) aberto em nova aba.
 *  - "Transcrição do Vídeo": arquivo de texto (.txt/.md/.vtt/.srt) cujo
 *    conteúdo é extraído e persistido para exibição junto ao player.
 *
 * Qualquer falha após gravar arquivos remove os já escritos no disco —
 * o banco nunca fica apontando para arquivo inexistente, nem o contrário.
 */
export async function uploadSectorVideo(formData: FormData): Promise<ActionResult> {
  const { user, error } = await requireUploader();
  if (!user) return { ok: false, error: error ?? undefined };

  const slug = String(formData.get("slug") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const kindRaw = String(formData.get("kind") ?? "VIDEO");
  const kind = ["VIDEO", "WORKSHOP", "INSTRUCAO"].includes(kindRaw) ? kindRaw : "VIDEO";
  const file = formData.get("file");
  const instructionFile = formData.get("instructionFile");
  const transcriptFile = formData.get("transcriptFile");

  if (!title) return { ok: false, error: "Informe o título do vídeo." };
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Selecione um arquivo de vídeo." };
  }

  const subsectorId = await subsectorIdFromSlug(slug);
  if (!subsectorId) return { ok: false, error: "Setor não encontrado." };

  // Rastreia tudo que foi gravado para desfazer em caso de erro.
  const written: string[] = [];
  async function rollback() {
    await Promise.all(written.map((absolutePath) => removeFile(absolutePath)));
  }

  let videoPath: string;
  let instructionPath: string | null = null;
  let transcriptPath: string | null = null;
  let transcriptText: string | null = null;

  try {
    const storedVideo = await storeFile(file, "video", "conteudo");
    written.push(storedVideo.absolutePath);
    videoPath = storedVideo.publicPath;

    if (instructionFile instanceof File && instructionFile.size > 0) {
      const stored = await storeFile(instructionFile, "instruction", "conteudo");
      written.push(stored.absolutePath);
      instructionPath = stored.publicPath;
    }

    if (transcriptFile instanceof File && transcriptFile.size > 0) {
      const stored = await storeFile(transcriptFile, "transcript", "conteudo");
      written.push(stored.absolutePath);
      transcriptPath = stored.publicPath;
      transcriptText = (await extractTranscriptText(transcriptFile)) || null;
    }
  } catch (e) {
    await rollback();
    if (e instanceof FileStorageError) return { ok: false, error: e.message };
    console.error("[uploadSectorVideo] storage:", e);
    return { ok: false, error: "Falha ao enviar os arquivos do vídeo." };
  }

  try {
    const count = await prisma.video.count({ where: { subsectorId } });
    await prisma.video.create({
      data: {
        subsectorId,
        title,
        kind: kind as "VIDEO" | "WORKSHOP" | "INSTRUCAO",
        filePath: videoPath,
        instructionPath,
        transcriptPath,
        transcriptText,
        isNew: true,
        order: count,
      },
    });
    revalidatePath(`/setores/${slug}`);
    return { ok: true };
  } catch (e) {
    await rollback();
    console.error("[uploadSectorVideo] db:", e);
    return { ok: false, error: "Falha ao salvar o vídeo." };
  }
}

// ──────────────────────────────────────────────
// Upload de documento (PDF/DOCX/XLSX/PNG)
// ──────────────────────────────────────────────

export async function uploadSectorDocument(formData: FormData): Promise<ActionResult> {
  const { user, error } = await requireUploader();
  if (!user) return { ok: false, error: error ?? undefined };

  const slug = String(formData.get("slug") ?? "");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Selecione um documento." };
  }
  const name = String(formData.get("name") ?? "").trim() || file.name;

  const subsectorId = await subsectorIdFromSlug(slug);
  if (!subsectorId) return { ok: false, error: "Setor não encontrado." };

  let stored;
  try {
    stored = await storeFile(file, "document", "conteudo");
  } catch (e) {
    if (e instanceof FileStorageError) return { ok: false, error: e.message };
    console.error("[uploadSectorDocument] storage:", e);
    return { ok: false, error: "Falha ao enviar o documento." };
  }

  try {
    const count = await prisma.document.count({ where: { subsectorId } });
    await prisma.document.create({
      data: {
        subsectorId,
        name,
        kind: docKind(file.type),
        sizeBytes: stored.sizeBytes,
        filePath: stored.publicPath,
        order: count,
      },
    });
    revalidatePath(`/setores/${slug}`);
    return { ok: true };
  } catch (e) {
    await removeFile(stored.absolutePath);
    console.error("[uploadSectorDocument] db:", e);
    return { ok: false, error: "Falha ao salvar o documento." };
  }
}

// ──────────────────────────────────────────────
// Aplicativos (atalhos de plataforma)
// ──────────────────────────────────────────────

const linkSchema = z.object({
  slug: z.string().min(1),
  label: z.string().trim().min(1, "Informe o nome do aplicativo."),
  // .url() do Zod aceita QUALQUER esquema que o construtor URL entenda —
  // "javascript:..." inclusive, que vira execução de script no navegador de
  // quem clicar no atalho. O protocolo é conferido à parte.
  url: z
    .string()
    .trim()
    .url("URL inválida.")
    .refine((value) => {
      try {
        const protocol = new URL(value).protocol;
        return protocol === "http:" || protocol === "https:";
      } catch {
        return false;
      }
    }, "Use um endereço http:// ou https://."),
});

/** Ícone opcional: passa pelo sharp e vira .webp (nunca binário no banco). */
async function storeLinkIcon(
  file: FormDataEntryValue | null,
): Promise<{ publicPath: string; absolutePath: string } | null> {
  if (!(file instanceof File) || file.size === 0) return null;
  const stored = await processAndStoreImage(file, "conteudo", {
    maxDimension: 256,
    quality: 82,
  });
  return { publicPath: stored.publicPath, absolutePath: stored.absolutePath };
}

/** Remove do disco o ícone apontado por um caminho público (best-effort). */
async function removeIconFile(publicPath: string): Promise<void> {
  const absolutePath = toAbsolutePath(publicPath);
  if (absolutePath) await removeFile(absolutePath);
}

/** Cria um atalho. Disponível para quem tem `links.manage`. */
export async function addSectorLink(formData: FormData): Promise<ActionResult> {
  const { user, error } = await requireUploader();
  if (!user) return { ok: false, error: error ?? undefined };

  const parsed = linkSchema.safeParse({
    slug: String(formData.get("slug") ?? ""),
    label: String(formData.get("label") ?? ""),
    url: String(formData.get("url") ?? ""),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const { slug, label, url } = parsed.data;

  const subsectorId = await appScopeIdFromSlug(slug);
  if (!subsectorId) return { ok: false, error: "Setor não encontrado." };

  let icon: { publicPath: string; absolutePath: string } | null = null;
  try {
    icon = await storeLinkIcon(formData.get("icon"));
  } catch (e) {
    if (e instanceof ImageProcessingError) return { ok: false, error: e.message };
    console.error("[addSectorLink] icon:", e);
    return { ok: false, error: "Falha ao processar o ícone." };
  }

  try {
    const count = await prisma.externalLink.count({ where: { subsectorId } });
    await prisma.externalLink.create({
      data: { subsectorId, label, url, iconPath: icon?.publicPath ?? null, order: count },
    });
    revalidatePath(`/setores/${slug}`);
    return { ok: true };
  } catch (e) {
    if (icon) await removeFile(icon.absolutePath);
    console.error("[addSectorLink] db:", e);
    return { ok: false, error: "Falha ao salvar o aplicativo." };
  }
}

/** Edita um atalho. Exclusivo de Admin. */
export async function updateSectorLink(formData: FormData): Promise<ActionResult> {
  const { user, error } = await requireAdmin();
  if (!user) return { ok: false, error: error ?? undefined };

  const id = String(formData.get("id") ?? "");
  const parsed = linkSchema.safeParse({
    slug: String(formData.get("slug") ?? ""),
    label: String(formData.get("label") ?? ""),
    url: String(formData.get("url") ?? ""),
  });
  if (!id) return { ok: false, error: "Aplicativo não informado." };
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const { slug, label, url } = parsed.data;

  const current = await prisma.externalLink.findUnique({
    where: { id },
    select: { iconPath: true },
  });
  if (!current) return { ok: false, error: "Aplicativo não encontrado." };

  let icon: { publicPath: string; absolutePath: string } | null = null;
  try {
    icon = await storeLinkIcon(formData.get("icon"));
  } catch (e) {
    if (e instanceof ImageProcessingError) return { ok: false, error: e.message };
    console.error("[updateSectorLink] icon:", e);
    return { ok: false, error: "Falha ao processar o ícone." };
  }

  try {
    await prisma.externalLink.update({
      where: { id },
      data: { label, url, ...(icon ? { iconPath: icon.publicPath } : {}) },
    });
    // Ícone antigo só sai do disco depois que o banco confirmou a troca.
    if (icon && current.iconPath) await removeIconFile(current.iconPath);
    revalidatePath(`/setores/${slug}`);
    return { ok: true };
  } catch (e) {
    if (icon) await removeFile(icon.absolutePath);
    console.error("[updateSectorLink] db:", e);
    return { ok: false, error: "Falha ao atualizar o aplicativo." };
  }
}

/** Exclui um atalho e o ícone correspondente. Exclusivo de Admin. */
export async function deleteSectorLink(input: {
  id: string;
  slug: string;
}): Promise<ActionResult> {
  const { user, error } = await requireAdmin();
  if (!user) return { ok: false, error: error ?? undefined };
  if (!input.id) return { ok: false, error: "Aplicativo não informado." };

  try {
    const removed = await prisma.externalLink.delete({
      where: { id: input.id },
      select: { iconPath: true },
    });
    if (removed.iconPath) await removeIconFile(removed.iconPath);
    revalidatePath(`/setores/${input.slug}`);
    return { ok: true };
  } catch (e) {
    console.error("[deleteSectorLink] db:", e);
    return { ok: false, error: "Falha ao excluir o aplicativo." };
  }
}
