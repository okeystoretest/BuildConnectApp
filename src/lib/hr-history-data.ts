import { prisma } from "@/lib/db/prisma";
import { ROLE_LABEL } from "@/lib/permissions";
import { TRACKED_SUBSECTOR } from "@/lib/progress-scope";
import { approvedAverage, splitGrades } from "@/lib/sector-overview";
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
 *  - Média consolidada: as notas de compreensão de vídeo aprovadas, pela
 *    mesma regra de "Meu Setor" — a função vem de `lib/sector-overview` em vez
 *    de ser reescrita aqui, porque duas cópias da regra viram dois números
 *    para a mesma pessoa no dia em que uma delas mudar.
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
      sectorId: true,
      sector: { select: { label: true } },
    },
  });
  if (!user || !user.active) return null;

  /*
   * --- Catálogo de conteúdo e progresso do colaborador ---
   *
   * Só subsetores PADRAO (vitrine não é material a concluir) e só os do SETOR
   * DE LOTAÇÃO desta pessoa.
   *
   * O recorte por setor faltava, e era o bug visível na tela: esta consulta
   * varria o acervo PADRAO da empresa inteira, então alguém da Retaguarda com
   * 40 itens aparecia devendo 120. A régua aqui tem de ser a mesma de
   * "Meu Progresso" e de "Meu Setor" — três telas que mostram o mesmo número
   * para a mesma pessoa, ou nenhuma delas é levada a sério.
   *
   * Sem lotação não há material: o filtro devolve lista vazia em vez de
   * devolver tudo.
   */
  const tracked = { subsector: { ...TRACKED_SUBSECTOR, sectorId: user.sectorId ?? "" } };
  const [completed, videos, documents, grades] = await Promise.all([
    prisma.contentProgress.findMany({
      // `completed: false` é "chegou ao fim, não respondeu" — ainda não conta.
      where: { userId, completed: true, OR: [{ video: tracked }, { document: tracked }] },
      select: { videoId: true, documentId: true },
    }),
    prisma.video.findMany({ where: tracked, select: { id: true, title: true } }),
    prisma.document.findMany({ where: tracked, select: { id: true, name: true } }),
    /*
     * Notas já dadas às respostas de compreensão deste colaborador. Sem
     * recorte de setor de propósito: a nota é da pessoa e continua valendo se
     * ela mudar de lotação — apagar o histórico de desempenho a cada
     * transferência seria perder justamente o que o DHO veio ler.
     */
    prisma.videoComprehension.findMany({
      where: { userId, gradedAt: { not: null }, grade: { not: null } },
      select: { grade: true },
    }),
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

  // --- Média consolidada ---
  // O filtro da consulta garante `grade` não nulo; o `?? 0` existe só porque o
  // tipo gerado pelo Prisma não sabe disso.
  const { approved, rejections } = splitGrades(grades.map((g) => ({ grade: g.grade ?? 0 })));

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
    average: approvedAverage(approved),
    approvedCount: approved.length,
    rejections,
  };
}
