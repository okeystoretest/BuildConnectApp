import { prisma } from "@/lib/db/prisma";
import { TRACKED_SUBSECTOR, trackedSubsectorFilterOf } from "@/lib/progress-scope";
import type { Role } from "@/types";

/**
 * Cálculo de progresso do colaborador a partir de dados reais.
 *
 * Total de conteúdo = vídeos + documentos dos subsetores PADRAO a que o
 * usuário pertence (mesmo recorte de "Meu Progresso" e da barra lateral; Admin
 * vê tudo). Vitrines não entram (`TRACKED_SUBSECTOR`).
 * Concluídos = linhas de ContentProgress (completed) do usuário nesses
 * subsetores. O percentual geral é concluídos ÷ total, arredondado.
 */

export interface OverallProgress {
  overall: number;
  doneItems: number;
  totalItems: number;
}

export async function getOverallProgress(userId: string, role: Role): Promise<OverallProgress> {
  /*
   * Admin não tem denominador a recortar: ele alcança a empresa inteira, e é
   * isso que a barra dele mostra. Para todo mundo mais o escopo é o dos
   * SUBSETORES da pessoa — a MESMA régua de "Meu Setor" e do "Histórico do
   * Colaborador", vinda de um lugar só para as três telas não divergirem.
   */
  const inScope = {
    subsector: role === "ADMIN" ? TRACKED_SUBSECTOR : await trackedSubsectorFilterOf(userId),
  };

  const [totalVideos, totalDocuments, done] = await Promise.all([
    prisma.video.count({ where: inScope }),
    prisma.document.count({ where: inScope }),
    prisma.contentProgress.count({
      where: { userId, completed: true, OR: [{ video: inScope }, { document: inScope }] },
    }),
  ]);

  const totalItems = totalVideos + totalDocuments;
  const overall = totalItems === 0 ? 0 : Math.round((done / totalItems) * 100);

  return { overall, doneItems: done, totalItems };
}
