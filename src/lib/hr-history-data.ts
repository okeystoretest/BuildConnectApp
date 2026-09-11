import { prisma } from "@/lib/db/prisma";
import { ROLE_LABEL } from "@/lib/permissions";
import type { Role } from "@/types";
import type {
  EmployeeHistory,
  EmployeeSummary,
  PendingGroup,
  PendingItem,
} from "@/types/hr";

/**
 * Dados reais do "Histórico do Colaborador" (RH), focado em ENGAJAMENTO.
 *
 * Compõe, por colaborador arbitrário (userId):
 *  - Progresso de conteúdo (ContentProgress) → indicadores de vídeos
 *    assistidos, documentos lidos e instruções lidas, com breakdown e
 *    percentual geral.
 *  - Pendências detalhadas: os conteúdos ainda NÃO concluídos, com título,
 *    agrupados por tipo de mídia (para o detalhamento expandido).
 *  - Feedbacks recebidos: estrutura preparada (0 até a funcionalidade futura).
 *
 * Chamados foram removidos deste módulo por decisão de escopo.
 */

function pct(done: number, total: number): number {
  return total === 0 ? 0 : Math.round((done / total) * 100);
}

/** Quantos colaboradores a lista mostra sem busca: só os cadastros mais novos. */
export const RECENT_EMPLOYEES_LIMIT = 5;
/** Teto de resultados por busca. */
export const EMPLOYEE_SEARCH_LIMIT = 20;

const SUMMARY_SELECT = {
  id: true,
  fullName: true,
  username: true,
  role: true,
  sector: { select: { label: true } },
} as const;

function toSummary(u: {
  id: string;
  fullName: string;
  username: string;
  role: string;
  sector: { label: string } | null;
}): EmployeeSummary {
  return {
    id: u.id,
    name: u.fullName,
    username: u.username,
    role: ROLE_LABEL[u.role as Role],
    sector: u.sector?.label ?? "—",
  };
}

/**
 * Colaboradores que a lista do histórico mostra ANTES de qualquer busca: os
 * cinco cadastrados por último. O restante da empresa não vai para a página —
 * só aparece pela busca (`searchEmployees`).
 */
export async function getRecentEmployees(): Promise<EmployeeSummary[]> {
  const users = await prisma.user.findMany({
    where: { active: true },
    orderBy: { createdAt: "desc" },
    take: RECENT_EMPLOYEES_LIMIT,
    select: SUMMARY_SELECT,
  });
  return users.map(toSummary);
}

/** Busca por trecho do nome ou do usuário, sem diferenciar maiúsculas. */
export async function searchEmployeesByName(query: string): Promise<EmployeeSummary[]> {
  const term = query.trim();
  if (!term) return [];
  const users = await prisma.user.findMany({
    where: {
      active: true,
      OR: [
        { fullName: { contains: term, mode: "insensitive" } },
        { username: { contains: term, mode: "insensitive" } },
      ],
    },
    orderBy: { fullName: "asc" },
    take: EMPLOYEE_SEARCH_LIMIT,
    select: SUMMARY_SELECT,
  });
  return users.map(toSummary);
}

/**
 * Histórico completo de um colaborador. Retorna null se o usuário não
 * existir ou estiver inativo.
 */
export async function getEmployeeHistory(userId: string): Promise<EmployeeHistory | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      fullName: true,
      role: true,
      active: true,
      sector: { select: { label: true } },
    },
  });
  if (!user || !user.active) return null;

  // --- Catálogo de conteúdo e progresso do colaborador ---
  const [completed, videos, documents] = await Promise.all([
    prisma.contentProgress.findMany({
      where: { userId },
      select: { videoId: true, documentId: true },
    }),
    prisma.video.findMany({ select: { id: true, title: true } }),
    prisma.document.findMany({ select: { id: true, name: true } }),
  ]);

  const doneVideos = new Set<string>();
  const doneDocs = new Set<string>();
  for (const c of completed) {
    if (c.videoId) doneVideos.add(c.videoId);
    else if (c.documentId) doneDocs.add(c.documentId);
  }

  const videosWatched = doneVideos.size;
  const documentsRead = doneDocs.size;

  const breakdown = [
    {
      label: "Vídeos assistidos",
      done: videosWatched,
      total: videos.length,
      icon: "PlayCircle",
      tone: "primary" as const,
    },
    {
      label: "Documentos lidos",
      done: documentsRead,
      total: documents.length,
      icon: "FileText",
      tone: "info" as const,
    },
  ];

  const doneItems = videosWatched + documentsRead;
  const totalItems = videos.length + documents.length;

  // --- Pendências detalhadas, agrupadas por tipo de mídia ---
  const pendingVideos: PendingItem[] = videos
    .filter((v) => !doneVideos.has(v.id))
    .map((v) => ({ id: v.id, title: v.title }));
  const pendingDocs: PendingItem[] = documents
    .filter((d) => !doneDocs.has(d.id))
    .map((d) => ({ id: d.id, title: d.name }));
  const pendingGroups: PendingGroup[] = (
    [
      { label: "Vídeos", icon: "PlayCircle", tone: "primary", items: pendingVideos },
      { label: "Documentos", icon: "FileText", tone: "info", items: pendingDocs },
    ] as const satisfies readonly PendingGroup[]
  ).filter((g) => g.items.length > 0);

  const pendingItems = pendingVideos.length + pendingDocs.length;

  return {
    id: user.id,
    name: user.fullName,
    role: ROLE_LABEL[user.role as Role],
    sector: user.sector?.label ?? "—",
    overallPercent: pct(doneItems, totalItems),
    doneItems,
    totalItems,
    breakdown,
    videosWatched,
    documentsRead,
    pendingItems,
    pendingGroups,
    // Feedbacks: estrutura pronta; zerado até a funcionalidade futura.
    feedbacksReceived: 0,
  };
}
