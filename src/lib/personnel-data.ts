import { prisma } from "@/lib/db/prisma";
import { formatBytes } from "@/lib/utils";
import {
  OTHERS_GROUP_KEY,
  OTHERS_GROUP_LABEL,
  PERSONNEL_CATEGORY_KEYS,
  PERSONNEL_GROUPS,
  categoryLabel,
  countsForProgress,
} from "@/lib/personnel-catalog";
import {
  folderStatus,
  isoDay,
  personStatus,
  todayBR,
} from "@/lib/personnel-expiry";
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

  // Os vencimentos do quadro inteiro numa consulta, pelo mesmo motivo do
  // `groupBy` acima. São poucas linhas: só pasta que vence tem uma.
  const expiryByOwner = await expiriesByOwner();
  const today = todayBR();

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

    // O estado de cada pasta exigida, mais o das pastas que têm arquivo mas
    // já saíram da exigência: um ASO vencido continua vencido depois de a
    // pasta ser removida do catálogo, e o painel não pode calar isso.
    const expiries = expiryByOwner.get(u.id) ?? new Map<string, string>();
    const statuses = [...new Set([...required, ...has])].map((folder) =>
      folderStatus(has.has(folder), expiries.get(folder) ?? null, today, !countsForProgress(folder)),
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
      /*
       * "Completo" = entregou tudo o que se exige dele e nada está vencido.
       *
       * Pasta opcional fica de fora: cobrar certidão de filho menor de quem
       * não tem filho deixaria o número permanentemente abaixo do real.
       *
       * Documento A VENCER ainda conta como completo — ele é válido hoje, e o
       * aviso de 30 dias já aparece no contador "Cuidado". Sai de completo
       * quando VENCE, e volta sozinho quando o documento novo entra.
       */
      complete:
        [...required].every((folder) => !countsForProgress(folder) || has.has(folder)) &&
        !statuses.includes("vencido"),
      status: personStatus(statuses),
      // "pendente" já exclui as opcionais: `folderStatus` as devolve como
      // "opcional" quando vazias.
      pendingFolders: statuses.filter((s) => s === "pendente").length,
      expiredFolders: statuses.filter((s) => s === "vencido").length,
      warningFolders: statuses.filter((s) => s === "cuidado").length,
    };
  });
}

/** O vencimento de cada pasta, por dono, em "aaaa-mm-dd". */
async function expiriesByOwner(ownerId?: string): Promise<Map<string, Map<string, string>>> {
  const rows = await prisma.personnelFolderExpiry.findMany({
    where: ownerId ? { ownerId } : undefined,
    select: { ownerId: true, folder: true, expiresAt: true },
  });

  const byOwner = new Map<string, Map<string, string>>();
  for (const r of rows as { ownerId: string; folder: string; expiresAt: Date }[]) {
    const folders = byOwner.get(r.ownerId) ?? new Map<string, string>();
    folders.set(r.folder, isoDay(r.expiresAt));
    byOwner.set(r.ownerId, folders);
  }
  return byOwner;
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

  // Vencimento e estado, montados num lugar só: as pastas nascem em dois
  // trechos (catálogo e extras) e um deles esqueceria de calcular o estado.
  const expiries = (await expiriesByOwner(ownerId)).get(ownerId) ?? new Map<string, string>();
  const today = todayBR();
  const folder = (key: string, label: string, fixed: boolean) => {
    const files = byFolder.get(key) ?? [];
    const expiresOn = expiries.get(key) ?? null;
    return {
      key,
      label,
      fixed,
      files,
      expiresOn,
      status: folderStatus(files.length > 0, expiresOn, today, !countsForProgress(key)),
    };
  };

  const groups: PersonnelFolderGroup[] = PERSONNEL_GROUPS.map((g) => ({
    key: g.key,
    label: groupLabel(g.key, g.label),
    folders: g.categories.filter((c) => visible(c.key)).map((c) => folder(c.key, c.label, true)),
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
      folders: [...extraNames]
        .sort((a, b) => a.localeCompare(b, "pt-BR"))
        .map((name) => folder(name, name, false)),
    });
  }

  return groups;
}
