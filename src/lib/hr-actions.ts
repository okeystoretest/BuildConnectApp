"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/require-user";
import { can } from "@/lib/permissions";
import type { Role } from "@/types";
import { storeFile, removeFile, FileStorageError } from "@/lib/storage/files";

export interface ActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

const schema = z.object({
  title: z.string().trim().min(1, "Informe o título."),
  scope: z.string().trim().min(1, "Informe a abrangência."),
  progress: z.coerce.number().min(0).max(100).default(0),
  status: z.enum(["CONCLUIDO", "EM_ANDAMENTO"]).default("EM_ANDAMENTO"),
});

/** Cria um mapa de integração com PDF opcional. Exige content.upload. */
export async function uploadIntegrationMap(formData: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sessão expirada. Faça login novamente." };
  if (!can(user.role as Role, "content.upload")) {
    return { ok: false, error: "Você não tem permissão para enviar mapas." };
  }

  const parsed = schema.safeParse({
    title: formData.get("title"),
    scope: formData.get("scope"),
    progress: formData.get("progress") ?? 0,
    status: formData.get("status") ?? "EM_ANDAMENTO",
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) {
      const k = i.path[0];
      if (typeof k === "string" && !fieldErrors[k]) fieldErrors[k] = i.message;
    }
    return { ok: false, error: "Revise os campos.", fieldErrors };
  }
  const data = parsed.data;

  let filePath: string | null = null;
  let absolutePath: string | null = null;
  const file = formData.get("file");
  if (file instanceof File && file.size > 0) {
    try {
      const stored = await storeFile(file, "pdf", "conteudo");
      filePath = stored.publicPath;
      absolutePath = stored.absolutePath;
    } catch (e) {
      if (e instanceof FileStorageError) return { ok: false, error: e.message };
      console.error("[uploadIntegrationMap] storage:", e);
      return { ok: false, error: "Falha ao enviar o PDF." };
    }
  }

  try {
    await prisma.integrationMap.create({
      data: {
        title: data.title,
        scope: data.scope,
        progress: data.progress,
        status: data.status,
        filePath,
      },
    });
    revalidatePath("/setores/rh");
    return { ok: true };
  } catch (e) {
    if (absolutePath) await removeFile(absolutePath);
    console.error("[uploadIntegrationMap] db:", e);
    return { ok: false, error: "Falha ao salvar o mapa." };
  }
}
