"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/require-user";
import { canAdministerDho } from "@/lib/auth/access";
import { docKind, storeFile, removeFile, FileStorageError } from "@/lib/storage/files";
import { toAbsolutePath } from "@/lib/storage/config";
import {
  categoryLabel,
  collidesWithCatalog,
  normalizeFolderName,
} from "@/lib/personnel-catalog";
import { getPersonnelFolders } from "@/lib/personnel-data";
import type { PersonnelFolderGroup } from "@/types/hr";
import type { Role } from "@/types";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

/**
 * Departamento Pessoal — RBAC.
 *
 * A matriz de permissões de papel não serve aqui: `content.upload` abriria o
 * arquivo pessoal de qualquer colaborador para o Gestor de qualquer setor. A
 * régua é a mesma da aba, `canAdministerDho` (Admin + Gestor lotado no DHO) —
 * é documentação de RH, e quem a manuseia é o RH.
 *
 * Arquivar e CRIAR pasta: Gestor do DHO.
 * EXCLUIR pasta ou arquivo: só Admin. Exclusão aqui apaga o único exemplar de
 * um documento admissional, e isso não se desfaz.
 */
async function requireDhoManager() {
  const user = await getCurrentUser();
  if (!user) return { user: null, error: "Sessão expirada. Faça login novamente." };
  if (!(await canAdministerDho(user.id, user.role as Role))) {
    return { user: null, error: "O Departamento Pessoal é exclusivo da gestão do DHO." };
  }
  return { user, error: null };
}

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return { user: null, error: "Sessão expirada. Faça login novamente." };
  if ((user.role as Role) !== "ADMIN") {
    return { user: null, error: "Apenas o Administrador pode excluir." };
  }
  return { user, error: null };
}

/** Colaborador ATIVO; inativo não recebe nem entrega documentação. */
async function activeOwner(ownerId: string) {
  if (!ownerId) return null;
  return prisma.user.findFirst({
    where: { id: ownerId, active: true },
    select: { id: true, personnelFolders: true },
  });
}

// ──────────────────────────────────────────────
// Leitura sob demanda das pastas de um colaborador
// ──────────────────────────────────────────────

/**
 * Pastas e arquivos de UM colaborador, buscados ao abrir a pasta dele.
 *
 * Sob demanda, e não tudo na página: são 11 pastas fixas por pessoa ativa, e
 * carregar a documentação de todo o quadro para mostrar uma pasta seria pagar
 * o arquivo inteiro da empresa em cada abertura da aba.
 */
export async function fetchPersonnelFolders(
  ownerId: string,
): Promise<{ ok: boolean; groups?: PersonnelFolderGroup[]; error?: string }> {
  const { user, error } = await requireDhoManager();
  if (!user) return { ok: false, error: error ?? undefined };

  const groups = await getPersonnelFolders(ownerId);
  if (!groups) return { ok: false, error: "Colaborador não encontrado." };
  return { ok: true, groups };
}

// ──────────────────────────────────────────────
// Arquivar documento na pasta do colaborador
// ──────────────────────────────────────────────

export async function uploadPersonnelFile(formData: FormData): Promise<ActionResult> {
  const { user, error } = await requireDhoManager();
  if (!user) return { ok: false, error: error ?? undefined };

  const ownerId = String(formData.get("ownerId") ?? "");
  const folder = String(formData.get("folder") ?? "");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Selecione um documento." };
  }

  const owner = await activeOwner(ownerId);
  if (!owner) return { ok: false, error: "Colaborador não encontrado." };

  // A pasta tem de existir de fato: ou é do catálogo fixo, ou está na lista
  // do colaborador. Sem esta checagem o `folder` vindo do formulário criaria
  // pastas invisíveis — nada na tela as mostraria, e o arquivo sumia.
  const known = Boolean(categoryLabel(folder)) || owner.personnelFolders.includes(folder);
  if (!known) return { ok: false, error: "Pasta não encontrada." };

  const name = String(formData.get("name") ?? "").trim() || file.name;

  let stored;
  try {
    stored = await storeFile(file, "document", "pessoal");
  } catch (e) {
    if (e instanceof FileStorageError) return { ok: false, error: e.message };
    console.error("[uploadPersonnelFile] storage:", e);
    return { ok: false, error: "Falha ao enviar o documento." };
  }

  try {
    await prisma.personnelFile.create({
      data: {
        ownerId: owner.id,
        folder,
        name,
        kind: docKind(file.type, file.name),
        sizeBytes: stored.sizeBytes,
        filePath: stored.publicPath,
      },
    });
  } catch (e) {
    await removeFile(stored.absolutePath);
    console.error("[uploadPersonnelFile] db:", e);
    return { ok: false, error: "Falha ao salvar o documento." };
  }

  // Sem `notifyNewContent`: documentação pessoal não é conteúdo a divulgar.
  revalidatePath("/setores/rh");
  return { ok: true };
}

// ──────────────────────────────────────────────
// Criar pasta extra (Gestor do DHO)
// ──────────────────────────────────────────────

export async function createPersonnelFolder(formData: FormData): Promise<ActionResult> {
  const { user, error } = await requireDhoManager();
  if (!user) return { ok: false, error: error ?? undefined };

  const ownerId = String(formData.get("ownerId") ?? "");
  const name = normalizeFolderName(String(formData.get("name") ?? ""));
  if (!name) return { ok: false, error: "Informe o nome da pasta." };
  if (collidesWithCatalog(name)) {
    return { ok: false, error: "Já existe uma pasta obrigatória com esse nome." };
  }

  const owner = await activeOwner(ownerId);
  if (!owner) return { ok: false, error: "Colaborador não encontrado." };

  if (owner.personnelFolders.some((f: string) => f.toLowerCase() === name.toLowerCase())) {
    return { ok: false, error: "Esse colaborador já tem uma pasta com esse nome." };
  }

  await prisma.user.update({
    where: { id: owner.id },
    data: { personnelFolders: { push: name } },
  });

  revalidatePath("/setores/rh");
  return { ok: true };
}

// ──────────────────────────────────────────────
// Excluir (Admin)
// ──────────────────────────────────────────────

/**
 * Exclui uma pasta extra E os arquivos dentro dela.
 *
 * Pasta do catálogo não é excluível: ela é constante em código e voltaria na
 * próxima renderização — o botão só apareceria para enganar.
 */
export async function deletePersonnelFolder(formData: FormData): Promise<ActionResult> {
  const { user, error } = await requireAdmin();
  if (!user) return { ok: false, error: error ?? undefined };

  const ownerId = String(formData.get("ownerId") ?? "");
  const folder = String(formData.get("folder") ?? "");
  if (categoryLabel(folder)) {
    return { ok: false, error: "Pastas obrigatórias não podem ser excluídas." };
  }

  const owner = await activeOwner(ownerId);
  if (!owner) return { ok: false, error: "Colaborador não encontrado." };

  const files = await prisma.personnelFile.findMany({
    where: { ownerId: owner.id, folder },
    select: { filePath: true },
  });

  await prisma.$transaction([
    prisma.personnelFile.deleteMany({ where: { ownerId: owner.id, folder } }),
    prisma.user.update({
      where: { id: owner.id },
      data: { personnelFolders: owner.personnelFolders.filter((f: string) => f !== folder) },
    }),
  ]);

  // Disco por último: a linha do banco é a verdade, e um arquivo órfão em
  // disco é menos grave do que uma linha apontando para um arquivo que já foi.
  await Promise.all(
    files
      .map((f: { filePath: string }) => toAbsolutePath(f.filePath))
      .filter((abs): abs is string => Boolean(abs))
      .map((abs) => removeFile(abs)),
  );

  revalidatePath("/setores/rh");
  return { ok: true };
}

export async function deletePersonnelFile(formData: FormData): Promise<ActionResult> {
  const { user, error } = await requireAdmin();
  if (!user) return { ok: false, error: error ?? undefined };

  const id = String(formData.get("id") ?? "");
  const file = await prisma.personnelFile.findUnique({
    where: { id },
    select: { id: true, filePath: true },
  });
  if (!file) return { ok: false, error: "Documento não encontrado." };

  await prisma.personnelFile.delete({ where: { id: file.id } });
  const absolute = toAbsolutePath(file.filePath);
  if (absolute) await removeFile(absolute);

  revalidatePath("/setores/rh");
  return { ok: true };
}
