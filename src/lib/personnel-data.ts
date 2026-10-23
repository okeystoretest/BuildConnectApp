import { prisma } from "@/lib/db/prisma";
import { formatBytes } from "@/lib/utils";
import {
  OTHERS_GROUP_KEY,
  OTHERS_GROUP_LABEL,
  PERSONNEL_CATEGORY_KEYS,
  PERSONNEL_GROUPS,
  categoryLabel,
} from "@/lib/personnel-catalog";
import type {
  PersonnelFile,
  PersonnelFolderGroup,
  PersonnelPerson,
} from "@/types/hr";
import type { Role } from "@/types";

/**
 * Departamento Pessoal: a documentação pessoal de cada colaborador ATIVO.
 *
 * A "pasta por colaborador ativo" é DERIVADA da lista de ativos, não gerada:
 * não há rotina a rodar, nem pasta órfã quando alguém é desativado, nem pasta
 * faltando quando alguém é admitido. Desativar um cadastro tira a pasta da
 * tela e os arquivos continuam no banco — o `onDelete: Cascade` só dispara se
 * o cadastro for realmente apagado.
 */

/** Colaboradores ativos, com a contagem de arquivos e o estado de entrega. */
export async function getPersonnelRoster(): Promise<PersonnelPerson[]> {
  const rows = await prisma.user.findMany({
    where: { active: true },
    orderBy: { fullName: "asc" },
    select: {
      id: true,
      fullName: true,
      username: true,
      role: true,
      avatarPath: true,
      personnelFolders: true,
      personnelRemovedFolders: true,
      sector: { select: { label: true, slug: true } },
      _count: { select: { personnelFiles: true } },
    },
  });

  // Quais pastas de cada um já têm arquivo. Um `groupBy` para a lista inteira,
  // e não uma consulta por pessoa: a tela abre com o quadro todo.
  const filled = await prisma.personnelFile.groupBy({
    by: ["ownerId", "folder"],
  });
  const filledByOwner = new Map<string, Set<string>>();
  for (const f of filled as { ownerId: string; folder: string }[]) {
    const set = filledByOwner.get(f.ownerId) ?? new Set<string>();
    set.add(f.folder);
    filledByOwner.set(f.ownerId, set);
  }

  return rows.map((u: {
    id: string;
    fullName: string;
    username: string;
    role: string;
    avatarPath: string | null;
    personnelFolders: string[];
    personnelRemovedFolders: string[];
    sector: { label: string; slug: string } | null;
    _count: { personnelFiles: number };
  }) => {
    // "Completo" cobre as pastas EXTRA também, não só o catálogo: elas
    // aparecem vermelhas na tela de pastas quando vazias, e o card não pode
    // dizer que está tudo entregue enquanto uma delas acusa pendência.
    //
    // E uma pasta EXCLUÍDA não é exigida: sem este desconto, quem teve uma
    // pasta do catálogo removida nunca mais apareceria em dia.
    const has = filledByOwner.get(u.id) ?? new Set<string>();
    const removed = new Set(u.personnelRemovedFolders);
    const required = new Set(
      [...PERSONNEL_CATEGORY_KEYS, ...u.personnelFolders].filter(
        (f) => !removed.has(f) || has.has(f),
      ),
    );

    return {
      id: u.id,
      name: u.fullName,
      username: u.username,
      role: u.role as Role,
      sector: u.sector?.label ?? "—",
      sectorSlug: u.sector?.slug ?? "",
      avatarPath: u.avatarPath ?? undefined,
      fileCount: u._count.personnelFiles,
      complete: [...required].every((folder) => has.has(folder)),
    };
  });
}

/**
 * As pastas de UM colaborador: o catálogo fixo, sempre completo (pasta vazia
 * aparece — é o lugar que diz o que ainda falta entregar), seguido das pastas
 * extra criadas à mão.
 *
 * `null` quando o cadastro não existe ou está inativo: o chamador não deve
 * mostrar documentação pessoal de quem saiu da lista.
 */
export async function getPersonnelFolders(
  ownerId: string,
): Promise<PersonnelFolderGroup[] | null> {
  const owner = await prisma.user.findFirst({
    where: { id: ownerId, active: true },
    select: { personnelFolders: true, personnelRemovedFolders: true },
  });
  if (!owner) return null;

  const files = await prisma.personnelFile.findMany({
    where: { ownerId },
    orderBy: { createdAt: "desc" },
  });

  const byFolder = new Map<string, PersonnelFile[]>();
  for (const f of files as {
    id: string;
    name: string;
    sizeBytes: number;
    kind: string;
    filePath: string;
    folder: string;
  }[]) {
    const list = byFolder.get(f.folder) ?? [];
    list.push({
      id: f.id,
      name: f.name,
      size: formatBytes(f.sizeBytes),
      // A UI só estiliza PDF/DOCX/XLSX/PPTX; PNG cai no neutro de PDF.
      kind: (f.kind === "PNG" ? "PDF" : f.kind) as PersonnelFile["kind"],
      filePath: f.filePath,
    });
    byFolder.set(f.folder, list);
  }

  // Pasta do catálogo excluída para esta pessoa não é gerada. A exceção é ela
  // ainda ter arquivo: nenhum documento desaparece da tela porque a pasta
  // saiu — ele voltaria inalcançável, e a exclusão apaga os arquivos junto.
  const removed = new Set(owner.personnelRemovedFolders);
  const visible = (key: string) => !removed.has(key) || (byFolder.get(key)?.length ?? 0) > 0;

  // Só os blocos RENOMEADOS têm linha; o resto cai no nome de fábrica.
  const renamed = new Map(
    (await prisma.personnelGroupName.findMany()).map(
      (r: { key: string; label: string }) => [r.key, r.label] as const,
    ),
  );
  const groupLabel = (key: string, fallback: string) => renamed.get(key) ?? fallback;

  const groups: PersonnelFolderGroup[] = PERSONNEL_GROUPS.map((g) => ({
    key: g.key,
    label: groupLabel(g.key, g.label),
    folders: g.categories
      .filter((c) => visible(c.key))
      .map((c) => ({
        key: c.key,
        label: c.label,
        fixed: true,
        files: byFolder.get(c.key) ?? [],
      })),
  })).filter((g) => g.folders.length > 0);

  // Pastas extra. Entram também as pastas de arquivos cuja chave não é mais do
  // catálogo nem da lista do colaborador — um arquivo nunca fica invisível por
  // a pasta dele ter sido removida da constante ou do array.
  const extraNames = new Set<string>(owner.personnelFolders);
  for (const folder of byFolder.keys()) {
    if (!categoryLabel(folder)) extraNames.add(folder);
  }

  if (extraNames.size > 0) {
    groups.push({
      key: OTHERS_GROUP_KEY,
      label: groupLabel(OTHERS_GROUP_KEY, OTHERS_GROUP_LABEL),
      folders: [...extraNames].sort((a, b) => a.localeCompare(b, "pt-BR")).map((name) => ({
        key: name,
        label: name,
        fixed: false,
        files: byFolder.get(name) ?? [],
      })),
    });
  }

  return groups;
}
