"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/require-user";
import { can } from "@/lib/permissions";
import { storeFile, removeFile, FileStorageError } from "@/lib/storage/files";
import { toAbsolutePath } from "@/lib/storage/config";
import type { Role } from "@/types";

/**
 * Vídeo de boas-vindas da PLATAFORMA — o obrigatório da primeira entrada.
 *
 * Espelha `welcome-video-actions.ts`, que faz o mesmo para o vídeo de cada
 * setor, e pelos mesmos motivos:
 *
 *  - o binário vai para o disco (categoria `conteudo`, particionado por
 *    ano/mês); o banco guarda só o caminho público;
 *  - trocar o vídeo APAGA o arquivo anterior do disco (não acumula órfão na
 *    VPS) e ZERA as visualizações — o vídeo novo tem de ser assistido por
 *    todos, inclusive por quem já tinha visto o antigo;
 *  - publicar/remover exige `welcomeVideo.manage` (hoje só o Admin). Marcar
 *    como assistido é do próprio usuário logado.
 *
 * O que muda em relação ao do setor: aqui a linha é ÚNICA (id "singleton") e a
 * visualização é uma coluna do usuário, não uma tabela de junção.
 */

const SINGLETON = "singleton";

export interface PlatformWelcomeResult {
  ok: boolean;
  error?: string;
}

async function requirePublisher() {
  const user = await getCurrentUser();
  if (!user) return { user: null, error: "Sessão expirada. Faça login novamente." };
  if (!can(user.role as Role, "welcomeVideo.manage")) {
    return {
      user: null,
      error: "Apenas a administração pode publicar o vídeo de boas-vindas da plataforma.",
    };
  }
  return { user, error: null };
}

/** Apaga o arquivo físico de um caminho público, se ele existir. */
async function removePublicFile(publicPath: string | null) {
  if (!publicPath) return;
  const absolute = toAbsolutePath(publicPath);
  if (absolute) await removeFile(absolute);
}

export async function uploadPlatformWelcomeVideo(
  formData: FormData,
): Promise<PlatformWelcomeResult> {
  const { user, error } = await requirePublisher();
  if (!user) return { ok: false, error: error ?? undefined };

  const title = String(formData.get("title") ?? "").trim();
  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Selecione um arquivo de vídeo." };
  }

  const current = await prisma.platformWelcomeVideo.findUnique({
    where: { id: SINGLETON },
    select: { path: true },
  });

  let publicPath: string;
  let absolutePath: string;
  try {
    const stored = await storeFile(file, "video", "conteudo");
    publicPath = stored.publicPath;
    absolutePath = stored.absolutePath;
  } catch (e) {
    if (e instanceof FileStorageError) return { ok: false, error: e.message };
    console.error("[uploadPlatformWelcomeVideo] storage:", e);
    return { ok: false, error: "Falha ao enviar o vídeo." };
  }

  try {
    // Vídeo novo = todo mundo assiste de novo. As duas escritas andam juntas:
    // gravar o caminho sem zerar as visualizações deixaria a plataforma com
    // vídeo novo que ninguém veria.
    await prisma.$transaction([
      prisma.user.updateMany({
        where: { platformWelcomeWatchedAt: { not: null } },
        data: { platformWelcomeWatchedAt: null },
      }),
      prisma.platformWelcomeVideo.upsert({
        where: { id: SINGLETON },
        update: { path: publicPath, title: title || null, publishedAt: new Date() },
        create: { id: SINGLETON, path: publicPath, title: title || null },
      }),
    ]);
  } catch (e) {
    // Banco falhou: remove o arquivo recém-gravado para não virar órfão.
    await removeFile(absolutePath);
    console.error("[uploadPlatformWelcomeVideo] db:", e);
    return { ok: false, error: "Falha ao salvar o vídeo da plataforma." };
  }

  // Só depois de o banco confirmar é que o arquivo antigo pode sumir.
  await removePublicFile(current?.path ?? null);

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function removePlatformWelcomeVideo(): Promise<PlatformWelcomeResult> {
  const { user, error } = await requirePublisher();
  if (!user) return { ok: false, error: error ?? undefined };

  const current = await prisma.platformWelcomeVideo.findUnique({
    where: { id: SINGLETON },
    select: { path: true },
  });
  if (!current) return { ok: true };

  try {
    await prisma.$transaction([
      prisma.user.updateMany({
        where: { platformWelcomeWatchedAt: { not: null } },
        data: { platformWelcomeWatchedAt: null },
      }),
      prisma.platformWelcomeVideo.delete({ where: { id: SINGLETON } }),
    ]);
  } catch (e) {
    console.error("[removePlatformWelcomeVideo] db:", e);
    return { ok: false, error: "Falha ao remover o vídeo da plataforma." };
  }

  await removePublicFile(current.path);
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Marca o vídeo como assistido pelo usuário logado.
 *
 * É ESTA linha que faz a validação acompanhar a PESSOA, e não o navegador —
 * antes a marca vivia no localStorage, então trocar de aparelho, limpar o site
 * ou abrir uma janela anônima fazia o vídeo obrigatório voltar.
 *
 * Idempotente por escrita condicional: reassistir não move a data original.
 */
export async function markPlatformWelcomeWatched(): Promise<PlatformWelcomeResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sessão expirada. Faça login novamente." };

  try {
    await prisma.user.updateMany({
      where: { id: user.id, platformWelcomeWatchedAt: null },
      data: { platformWelcomeWatchedAt: new Date() },
    });
    return { ok: true };
  } catch (e) {
    console.error("[markPlatformWelcomeWatched] db:", e);
    return { ok: false, error: "Falha ao registrar a visualização." };
  }
}
