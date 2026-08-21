import { prisma } from "@/lib/db/prisma";

/**
 * Cálculo de progresso do colaborador a partir de dados reais.
 *
 * Total de conteúdo = vídeos + documentos existentes.
 * Concluídos = linhas de ContentProgress (completed) do usuário.
 * O percentual geral é concluídos ÷ total, arredondado.
 */

export interface OverallProgress {
  overall: number;
  doneItems: number;
  totalItems: number;
}

export async function getOverallProgress(userId: string): Promise<OverallProgress> {
  const [totalVideos, totalDocuments, done] = await Promise.all([
    prisma.video.count(),
    prisma.document.count(),
    prisma.contentProgress.count({
      where: { userId, completed: true },
    }),
  ]);

  const totalItems = totalVideos + totalDocuments;
  const overall = totalItems === 0 ? 0 : Math.round((done / totalItems) * 100);

  return { overall, doneItems: done, totalItems };
}
