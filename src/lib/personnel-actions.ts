"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/require-user";
import { canAdministerDho } from "@/lib/auth/access";
import { docKind, storeFile, removeFile, FileStorageError } from "@/lib/storage/files";
import { toAbsolutePath } from "@/lib/storage/config";
import {
  OTHERS_GROUP_KEY,
  OTHERS_GROUP_LABEL,
  PERSONNEL_GROUPS,
  catalogKeyByName,
  categoryLabel,
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
 * UMA régua para tudo: `canAdministerDho` (Admin + Gestor lotado no DHO), a
 * mesma que abre a aba. Arquivar, criar pasta, excluir pasta e excluir
 * arquivo passam por ela.
 *
 * A matriz de permissões de papel não serve: `content.upload` abriria o
 * arquivo pessoal de qualquer colaborador para o Gestor de qualquer setor. É
 * documentação de RH, e quem a manuseia é o RH.
 *
 * A exclusão já foi exclusiva do Admin. Deixou de ser a pedido: o Gestor do
 * DHO é quem monta e mantém o dossiê, e depender do Admin para corrigir a
 * própria estrutura travava o trabalho. A confirmação na tela continua sendo
 * o freio, porque excluir apaga o único exemplar de um documento.
 */
async function requireDhoManager() {
  const user = await getCurrentUser();
  if (!user) return { user: null, error: "Sessão expirada. Faça login novamente." };
  if (!(await canAdministerDho(user.id, user.role as Role))) {
    return { user: null, error: "O Departamento Pessoal é exclusivo da gestão do DHO." };
  }
  return { user, error: null };
}

/** Colaborador ATIVO; inativo não recebe nem entrega documentação. */
async function activeOwner(ownerId: string) {
  if (!ownerId) return null;
  return prisma.user.findFirst({
    where: { id: ownerId, active: true },
    select: { id: true, personnelFolders: true, personnelRemovedFolders: true },
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

  // A pasta tem de existir de fato: ou é do catálogo fixo e não foi excluída
  // para esta pessoa, ou está na lista dela. Sem esta checagem o `folder`
  // vindo do formulário criaria pastas invisíveis — nada na tela as mostraria,
  // e o arquivo sumia.
  const known =
    (Boolean(categoryLabel(folder)) && !owner.personnelRemovedFolders.includes(folder)) ||
    owner.personnelFolders.includes(folder);
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

  const owner = await activeOwner(ownerId);
  if (!owner) return { ok: false, error: "Colaborador não encontrado." };

  // Nome de pasta modelo. Se ela foi excluída para esta pessoa, criar com o
  // mesmo nome RESTAURA a original — recusar deixaria quem apagou "CTPS" sem
  // nenhuma forma de tê-la de volta. Se não foi excluída, ela já está na tela.
  const catalogKey = catalogKeyByName(name);
  if (catalogKey) {
    if (!owner.personnelRemovedFolders.includes(catalogKey)) {
      return { ok: false, error: "Essa pasta modelo já está na lista." };
    }
    await prisma.user.update({
      where: { id: owner.id },
      data: {
        personnelRemovedFolders: owner.personnelRemovedFolders.filter(
          (f: string) => f !== catalogKey,
        ),
      },
    });
    revalidatePath("/setores/rh");
    return { ok: true };
  }

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
// Renomear um bloco de pastas
// ──────────────────────────────────────────────

/**
 * Troca o nome de um bloco ("Admissionais e contratuais"…) para TODO MUNDO.
 *
 * Global, e não por colaborador: o bloco é a taxonomia do DHO, e a mesma
 * pasta cairia sob nomes diferentes de pessoa para pessoa — o contrário de
 * uma taxonomia.
 *
 * Voltar ao nome de fábrica é apagar a linha, não gravar o texto original: o
 * de fábrica mora na constante, e gravá-lo deixaria duas verdades sobre como
 * o bloco se chama no dia em que a constante mudasse.
 */
export async function renamePersonnelGroup(formData: FormData): Promise<ActionResult> {
  const { user, error } = await requireDhoManager();
  if (!user) return { ok: false, error: error ?? undefined };

  const key = String(formData.get("key") ?? "");
  const original = knownGroup(key);
  if (!original) return { ok: false, error: "Bloco não encontrado." };

  const label = normalizeFolderName(String(formData.get("label") ?? ""));
  if (!label) return { ok: false, error: "Informe o nome do bloco." };

  if (label === original) {
    await prisma.personnelGroupName.deleteMany({ where: { key } });
  } else {
    await prisma.personnelGroupName.upsert({
      where: { key },
      update: { label },
      create: { key, label },
    });
  }

  revalidatePath("/setores/rh");
  return { ok: true };
}

/** Nome de fábrica do bloco; `null` quando a chave não é de nenhum. */
function knownGroup(key: string): string | null {
  if (key === OTHERS_GROUP_KEY) return OTHERS_GROUP_LABEL;
  return PERSONNEL_GROUPS.find((g) => g.key === key)?.label ?? null;
}

// ──────────────────────────────────────────────
// Excluir (Admin)
// ──────────────────────────────────────────────

/**
 * Exclui uma pasta E os arquivos dentro dela.
 *
 * Vale para os dois tipos, por caminhos diferentes: a pasta criada à mão sai
 * de `personnelFolders`, e a pasta do CATÁLOGO entra em
 * `personnelRemovedFolders` — ela é constante em código, então só registrando
 * a remoção ela deixa de voltar na renderização seguinte.
 */
export async function deletePersonnelFolder(formData: FormData): Promise<ActionResult> {
  const { user, error } = await requireDhoManager();
  if (!user) return { ok: false, error: error ?? undefined };

  const ownerId = String(formData.get("ownerId") ?? "");
  const folder = String(formData.get("folder") ?? "");
  if (!folder) return { ok: false, error: "Pasta não informada." };

  const owner = await activeOwner(ownerId);
  if (!owner) return { ok: false, error: "Colaborador não encontrado." };

  const fromCatalog = Boolean(categoryLabel(folder));
  if (!fromCatalog && !owner.personnelFolders.includes(folder)) {
    return { ok: false, error: "Pasta não encontrada." };
  }

  const files = await prisma.personnelFile.findMany({
    where: { ownerId: owner.id, folder },
    select: { filePath: true },
  });

  await prisma.$transaction([
    prisma.personnelFile.deleteMany({ where: { ownerId: owner.id, folder } }),
    prisma.user.update({
      where: { id: owner.id },
      data: fromCatalog
        ? // `set` com a lista inteira, e não `push`: excluir duas vezes a
          // mesma pasta (duas abas, dois cliques) não pode duplicar a chave.
          {
            personnelRemovedFolders: [
              ...new Set([...owner.personnelRemovedFolders, folder]),
            ],
          }
        : { personnelFolders: owner.personnelFolders.filter((f: string) => f !== folder) },
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
  const { user, error } = await requireDhoManager();
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
