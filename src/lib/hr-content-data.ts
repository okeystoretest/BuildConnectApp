import { prisma } from "@/lib/db/prisma";
import type { IntegrationMap } from "@/types/hr";

/** Mapas de integração do DHO, reais. */
export async function getIntegrationMaps(): Promise<IntegrationMap[]> {
  const maps = await prisma.integrationMap.findMany({
    orderBy: { createdAt: "asc" },
  });

  return maps.map((m: {
    id: string;
    title: string;
    scope: string;
    progress: number;
    status: string;
    filePath: string | null;
  }) => ({
    id: m.id,
    title: m.title,
    scope: m.scope,
    progress: m.progress,
    status: m.status as IntegrationMap["status"],
    filePath: m.filePath ?? undefined,
  }));
}
