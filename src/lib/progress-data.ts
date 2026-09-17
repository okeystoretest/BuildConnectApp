import { prisma } from "@/lib/db/prisma";
import { resolveAccessibleSlugs } from "@/lib/auth/access";
import type { Role } from "@/types";

/**
 * Cálculo de progresso do colaborador a partir de dados reais.
 *
 * Total de conteúdo = vídeos + documentos dos subsetores a que o usuário
 * pertence (mesmo recorte de "Meu Progresso" e da barra lateral; Admin vê tudo).
 * Concluídos = linhas de ContentProgress (completed) do usuário nesses
 * subsetores. O percentual geral é concluídos ÷ total, arredondado.
 */

export interface OverallProgress {
  overall: number;
  doneItems: number;
  totalItems: number;
}

export async function getOverallProgress(userId: string, role: Role): Promise<OverallProgress> {
  const slugs = await resolveAccessibleSlugs(userId, role);
  const inScope = slugs === null ? {} : { subsector: { slug: { in: slugs } } };

  const [totalVideos, totalDocuments, done] = await Promise.all([
    prisma.video.count({ where: inScope }),
    prisma.document.count({ where: inScope }),
    prisma.contentProgress.count({
      where: {
        userId,
        completed: true,
        ...(slugs === null
          ? {}
          : { OR: [{ video: inScope }, { document: inScope }] }),
      },
    }),
  ]);

  const totalItems = totalVideos + totalDocuments;
  const overall = totalItems === 0 ? 0 : Math.round((done / totalItems) * 100);

  return { overall, doneItems: done, totalItems };
}
