"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/require-user";
import { can } from "@/lib/permissions";
import { storeFile, removeFile, FileStorageError } from "@/lib/storage/files";
import { toAbsolutePath } from "@/lib/storage/config";
import type { Role } from "@/types";

/**
 * Vídeo de boas-vindas do setor.
 *
 * Regras:
 *  - Um vídeo por subsetor (uma página = um vídeo).
 *  - O binário vai para o disco (categoria `conteudo`, particionado por
 *    ano/mês); o banco guarda só o caminho público.
 *  - Trocar o vídeo APAGA o arquivo anterior do disco (não acumula órfão na
 *    VPS) e ZERA as visualizações — o vídeo novo tem de ser assistido por
 *    todos, inclusive por quem já tinha visto o antigo.
 *  - Enviar/remover exige `content.upload` (Gestor e Admin). Marcar como
 *    assistido é do próprio usuário logado.
 */

export interface WelcomeVideoResult {
  ok: boolean;
  error?: string;
}

async function requireUploader() {
  const user = await getCurrentUser();
  if (!user) return { user: null, error: "Sessão expirada. Faça login novamente." };
  if (!can(user.role as Role, "content.upload")) {
    return { user: null, error: "Você não tem permissão para enviar conteúdo." };
  }
  return { user, error: null };
}

/** Apaga o arquivo físico de um caminho público, se ele existir. */
async function removePublicFile(publicPath: string | null) {
  if (!publicPath) return;
  const absolute = toAbsolutePath(publicPath);
  if (absolute) await removeFile(absolute);
}

export async function uploadWelcomeVideo(formData: FormData): Promise<WelcomeVideoResult> {
  const { user, error } = await requireUploader();
  if (!user) return { ok: false, error: error ?? undefined };

  const slug = String(formData.get("slug") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const file = formData.get("file");

  if (!slug) return { ok: false, error: "Setor não informado." };
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Selecione um arquivo de vídeo." };
  }

  const sub = await prisma.subsector.findUnique({
    where: { slug },
    select: { id: true, welcomeVideoPath: true },
  });
  if (!sub) return { ok: false, error: "Setor não encontrado." };

  let publicPath: string;
  let absolutePath: string;
  try {
    const stored = await storeFile(file, "video", "conteudo");
    publicPath = stored.publicPath;
    absolutePath = stored.absolutePath;
  } catch (e) {
    if (e instanceof FileStorageError) return { ok: false, error: e.message };
    console.error("[uploadWelcomeVideo] storage:", e);
    return { ok: false, error: "Falha ao enviar o vídeo." };
  }

  try {
    // Vídeo novo = todo mundo assiste de novo. As duas escritas andam juntas:
    // gravar o caminho sem limpar as visualizações deixaria o setor com vídeo
    // novo que ninguém veria.
    await prisma.$transaction([
      prisma.subsectorWelcomeView.deleteMany({ where: { subsectorId: sub.id } }),
      prisma.subsector.update({
        where: { id: sub.id },
        data: {
          welcomeVideoPath: publicPath,
          welcomeVideoTitle: title || null,
          welcomeVideoAt: new Date(),
        },
      }),
    ]);
  } catch (e) {
    // Banco falhou: remove o arquivo recém-gravado para não virar órfão.
    await removeFile(absolutePath);
    console.error("[uploadWelcomeVideo] db:", e);
    return { ok: false, error: "Falha ao salvar o vídeo do setor." };
  }

  // Só depois de o banco confirmar é que o arquivo antigo pode sumir.
  await removePublicFile(sub.welcomeVideoPath);

  revalidatePath(`/setores/${slug}`);
  return { ok: true };
}

export async function removeWelcomeVideo(slug: string): Promise<WelcomeVideoResult> {
  const { user, error } = await requireUploader();
  if (!user) return { ok: false, error: error ?? undefined };

  const sub = await prisma.subsector.findUnique({
    where: { slug },
    select: { id: true, welcomeVideoPath: true },
  });
  if (!sub) return { ok: false, error: "Setor não encontrado." };
  if (!sub.welcomeVideoPath) return { ok: true };

  try {
    await prisma.$transaction([
      prisma.subsectorWelcomeView.deleteMany({ where: { subsectorId: sub.id } }),
      prisma.subsector.update({
        where: { id: sub.id },
        data: { welcomeVideoPath: null, welcomeVideoTitle: null, welcomeVideoAt: null },
      }),
    ]);
  } catch (e) {
    console.error("[removeWelcomeVideo] db:", e);
    return { ok: false, error: "Falha ao remover o vídeo do setor." };
  }

  await removePublicFile(sub.welcomeVideoPath);
  revalidatePath(`/setores/${slug}`);
  return { ok: true };
}

/**
 * Marca o vídeo como assistido pelo usuário logado. Idempotente: reassistir
 * não duplica registro nem move a data original.
 */
export async function markWelcomeVideoWatched(slug: string): Promise<WelcomeVideoResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sessão expirada. Faça login novamente." };

  const sub = await prisma.subsector.findUnique({
    where: { slug },
    select: { id: true, welcomeVideoPath: true },
  });
  if (!sub) return { ok: false, error: "Setor não encontrado." };
  if (!sub.welcomeVideoPath) return { ok: true };

  try {
    await prisma.subsectorWelcomeView.upsert({
      where: { userId_subsectorId: { userId: user.id, subsectorId: sub.id } },
      update: {},
      create: { userId: user.id, subsectorId: sub.id },
    });
    return { ok: true };
  } catch (e) {
    console.error("[markWelcomeVideoWatched] db:", e);
    return { ok: false, error: "Falha ao registrar a visualização." };
  }
}
