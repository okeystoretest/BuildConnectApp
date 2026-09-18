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
import { MAX_BYTES } from "@/lib/storage/limits";
import { resolveAppScope } from "@/lib/app-scope";
import { hasComprehension } from "@/lib/video-comprehension";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

/** Mapeia MIME (ou, sem ele, a extensão) de documento para o enum FileKind. */
function docKind(mime: string, name: string): "PDF" | "DOCX" | "XLSX" | "PPTX" | "PNG" {
  const ext = name.toLowerCase().slice(name.lastIndexOf("."));
  if (mime === "application/pdf" || ext === ".pdf") return "PDF";
  if (mime.includes("presentationml") || mime === "application/vnd.ms-powerpoint" || ext === ".pptx" || ext === ".ppt") return "PPTX";
  if (mime.includes("wordprocessing") || mime === "application/msword" || ext === ".docx" || ext === ".doc") return "DOCX";
  if (mime.includes("spreadsheet") || mime === "application/vnd.ms-excel" || ext === ".xlsx" || ext === ".xls") return "XLSX";
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
    return { user: null, error: "Apenas administradores podem fazer isso." };
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
// Progresso de vídeo: chegou ao fim
// ──────────────────────────────────────────────

const videoEndedSchema = z.object({ videoId: z.string().min(1) });

/**
 * O player chegou ao fim de uma Instrução em Vídeo (`ended`): libera a
 * pergunta de compreensão (`endedAt`). O vídeo conta como assistido ao enviar
 * a resposta (`submitVideoComprehension`). Vitrines (Coleção, Workshop) não
 * têm regra de conclusão — a chamada é recusada.
 */
export async function markVideoEnded(input: { videoId: string }): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sessão expirada. Faça login novamente." };

  const parsed = videoEndedSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Dados inválidos." };
  const { videoId } = parsed.data;

  try {
    const video = await prisma.video.findUnique({
      where: { id: videoId },
      select: { kind: true, subsector: { select: { kind: true } } },
    });
    if (!video) return { ok: false, error: "Vídeo não encontrado." };
    if (!hasComprehension(video)) {
      return { ok: false, error: "Este vídeo não tem avaliação de compreensão." };
    }

    const where = { userId_videoId: { userId: user.id, videoId } };
    const existing = await prisma.contentProgress.findUnique({
      where,
      select: { endedAt: true },
    });
    if (existing) {
      if (!existing.endedAt) {
        await prisma.contentProgress.update({ where, data: { endedAt: new Date() } });
      }
    } else {
      // `completed: false` até a resposta chegar.
      await prisma.contentProgress.create({
        data: { userId: user.id, videoId, endedAt: new Date(), completed: false },
      });
    }
    return { ok: true };
  } catch (error) {
    console.error("[markVideoEnded] falha:", error);
    return { ok: false, error: "Não foi possível salvar seu progresso." };
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

/** Um vídeo por requisição; no lote, o navegador chama isto N vezes, em fila. */
const videoUploadSchema = z.object({
  slug: z.string().min(1),
  title: z.string().trim().min(1, "Informe o título do vídeo."),
  kind: z.enum(["VIDEO", "WORKSHOP", "INSTRUCAO"]).catch("VIDEO"),
});

/**
 * Envia o vídeo e, opcionalmente, a miniatura capturada no navegador (um
 * quadro do próprio vídeo, em JPEG). A miniatura passa pelo sharp e vira
 * .webp como qualquer imagem de conteúdo.
 *
 * A transcrição NÃO entra aqui: ela é enviada depois, pela tela de edição
 * (`updateSectorVideo`). O envio nasce só com o que o lote precisa.
 *
 * Qualquer falha após gravar arquivos remove os já escritos no disco —
 * o banco nunca fica apontando para arquivo inexistente, nem o contrário.
 */
export async function uploadSectorVideo(formData: FormData): Promise<ActionResult> {
  const { user, error } = await requireUploader();
  if (!user) return { ok: false, error: error ?? undefined };

  const parsed = videoUploadSchema.safeParse({
    slug: formData.get("slug"),
    title: formData.get("title"),
    kind: formData.get("kind") ?? "VIDEO",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const { slug, title, kind } = parsed.data;
  const file = formData.get("file");
  const thumbnailFile = formData.get("thumbnailFile");

  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Selecione um arquivo de vídeo." };
  }
  // A miniatura é opcional (o navegador pode não decodificar o vídeo), mas
  // quando vem tem o teto próprio — bem abaixo do de imagem de galeria.
  if (thumbnailFile instanceof File && thumbnailFile.size > MAX_BYTES.thumbnail) {
    return { ok: false, error: "Miniatura acima do limite." };
  }

  const subsectorId = await subsectorIdFromSlug(slug);
  if (!subsectorId) return { ok: false, error: "Setor não encontrado." };

  // Rastreia tudo que foi gravado para desfazer em caso de erro.
  const written: string[] = [];
  async function rollback() {
    await Promise.all(written.map((absolutePath) => removeFile(absolutePath)));
  }

  let videoPath: string;
  let thumbnailPath: string | null = null;

  try {
    const storedVideo = await storeFile(file, "video", "conteudo");
    written.push(storedVideo.absolutePath);
    videoPath = storedVideo.publicPath;

    if (thumbnailFile instanceof File && thumbnailFile.size > 0) {
      const stored = await processAndStoreImage(thumbnailFile, "conteudo");
      written.push(stored.absolutePath);
      thumbnailPath = stored.publicPath;
    }
  } catch (e) {
    await rollback();
    if (e instanceof FileStorageError || e instanceof ImageProcessingError) {
      return { ok: false, error: e.message };
    }
    console.error("[uploadSectorVideo] storage:", e);
    return { ok: false, error: "Falha ao enviar os arquivos do vídeo." };
  }

  try {
    const count = await prisma.video.count({ where: { subsectorId } });
    await prisma.video.create({
      data: {
        subsectorId,
        title,
        kind,
        filePath: videoPath,
        thumbnailPath,
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
// Edição e exclusão de vídeo (título, tags, transcrição)
// ──────────────────────────────────────────────

const videoUpdateSchema = z.object({
  slug: z.string().min(1),
  id: z.string().min(1),
  title: z.string().trim().min(1, "O título não pode ficar vazio."),
  // Tags viram as pílulas de filtro da aba. Sem repetição, caixa ignorada.
  tags: z.array(z.string().trim().min(1).max(40)).max(20),
  /** "keep" mantém a transcrição atual; "remove" apaga; "replace" troca pelo arquivo enviado. */
  transcriptMode: z.enum(["keep", "replace", "remove"]).catch("keep"),
});

/**
 * Tela de edição do vídeo: título, tags e transcrição.
 *
 * A transcrição chega aqui, e só aqui — o envio em lote não a aceita. O
 * arquivo novo é gravado ANTES de tocar no banco; a transcrição antiga só sai
 * do disco DEPOIS que o banco confirmou. Falha no meio: o arquivo novo é
 * removido e a antiga continua válida.
 */
export async function updateSectorVideo(formData: FormData): Promise<ActionResult> {
  const { user, error } = await requireUploader();
  if (!user) return { ok: false, error: error ?? undefined };

  const parsed = videoUpdateSchema.safeParse({
    slug: formData.get("slug"),
    id: formData.get("id"),
    title: formData.get("title"),
    tags: formData.getAll("tags").map(String),
    transcriptMode: formData.get("transcriptMode") ?? "keep",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const { slug, id, title, transcriptMode } = parsed.data;
  const tags = dedupeTags(parsed.data.tags);
  const transcriptFile = formData.get("transcriptFile");

  const subsectorId = await subsectorIdFromSlug(slug);
  if (!subsectorId) return { ok: false, error: "Setor não encontrado." };

  const current = await prisma.video.findFirst({
    where: { id, subsectorId },
    select: { transcriptPath: true },
  });
  if (!current) return { ok: false, error: "Vídeo não encontrado." };

  // `undefined` deixa a coluna como está no update do Prisma.
  let transcriptPath: string | null | undefined;
  let transcriptText: string | null | undefined;
  let novoAbsoluto: string | null = null;

  if (transcriptMode === "replace") {
    if (!(transcriptFile instanceof File) || transcriptFile.size === 0) {
      return { ok: false, error: "Selecione o arquivo da transcrição." };
    }
    try {
      const stored = await storeFile(transcriptFile, "transcript", "conteudo");
      novoAbsoluto = stored.absolutePath;
      transcriptPath = stored.publicPath;
      transcriptText = (await extractTranscriptText(transcriptFile)) || null;
    } catch (e) {
      if (e instanceof FileStorageError) return { ok: false, error: e.message };
      console.error("[updateSectorVideo] storage:", e);
      return { ok: false, error: "Falha ao enviar a transcrição." };
    }
  } else if (transcriptMode === "remove") {
    transcriptPath = null;
    transcriptText = null;
  }

  try {
    await prisma.video.update({
      where: { id },
      data: { title, tags, transcriptPath, transcriptText },
    });
  } catch (e) {
    if (novoAbsoluto) await removeFile(novoAbsoluto);
    console.error("[updateSectorVideo] db:", e);
    return { ok: false, error: "Falha ao salvar as alterações." };
  }

  // Banco confirmado: a transcrição antiga pode sair do disco.
  if (transcriptMode !== "keep" && current.transcriptPath) {
    const antigo = toAbsolutePath(current.transcriptPath);
    if (antigo) await removeFile(antigo);
  }

  revalidatePath(`/setores/${slug}`);
  return { ok: true };
}

/** Mesma tag em caixa diferente conta uma vez; a primeira grafia fica. */
function dedupeTags(tags: readonly string[]): string[] {
  const seen = new Map<string, string>();
  for (const tag of tags) {
    const key = tag.toLowerCase();
    if (!seen.has(key)) seen.set(key, tag);
  }
  return [...seen.values()];
}

/**
 * Exclui o vídeo: registro (o progresso cai em cascata) e, depois, os
 * arquivos — vídeo, miniatura e transcrição. Ordem deliberada: registro sem
 * arquivo é um card quebrado; arquivo sem registro é só espaço em disco.
 */
export async function deleteSectorVideo(input: {
  slug: string;
  id: string;
}): Promise<ActionResult> {
  const { user, error } = await requireAdmin();
  if (!user) return { ok: false, error: error ?? undefined };

  const parsed = z.object({ slug: z.string().min(1), id: z.string().min(1) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Dados inválidos." };
  const { slug, id } = parsed.data;

  const subsectorId = await subsectorIdFromSlug(slug);
  if (!subsectorId) return { ok: false, error: "Setor não encontrado." };

  const video = await prisma.video.findFirst({
    where: { id, subsectorId },
    select: { filePath: true, thumbnailPath: true, transcriptPath: true },
  });
  if (!video) return { ok: false, error: "Vídeo não encontrado." };

  try {
    await prisma.video.delete({ where: { id } });
  } catch (e) {
    console.error("[deleteSectorVideo] db:", e);
    return { ok: false, error: "Falha ao excluir o vídeo." };
  }

  await Promise.all(
    [video.filePath, video.thumbnailPath, video.transcriptPath]
      .map((publicPath) => (publicPath ? toAbsolutePath(publicPath) : null))
      .filter((abs): abs is string => Boolean(abs))
      .map((abs) => removeFile(abs)),
  );

  revalidatePath(`/setores/${slug}`);
  return { ok: true };
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
        kind: docKind(file.type, file.name),
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
