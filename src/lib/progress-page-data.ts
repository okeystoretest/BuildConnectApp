import { prisma } from "@/lib/db/prisma";
import type { SectorProgress, AreaProgress } from "@/types/content";
import type { PendingCategory } from "@/lib/pending-content";
import { formatBytes } from "@/lib/utils";

/**
 * Agregação de progresso do colaborador para a tela "Meu Progresso".
 *
 * Tudo é derivado de dados reais:
 *  - progresso por área: % de vídeos e % de documentos concluídos por subsetor;
 *  - cards de resumo: geral, áreas mapeadas, itens pendentes;
 *  - donut: consumo total (concluídos ÷ total);
 *  - pendências: vídeos/documentos ainda não concluídos, agrupados por setor.
 */

export interface ProgressPageData {
  overall: number;
  mappedAreas: number;
  pendingItems: number;
  consumedItems: number;
  totalItems: number;
  sectors: SectorProgress[];
  pending: PendingCategory[];
}

function pct(done: number, total: number): number {
  return total === 0 ? 0 : Math.round((done / total) * 100);
}

export async function getProgressPageData(userId: string): Promise<ProgressPageData> {
  // Estrutura de setores → subsetores com seu conteúdo (vídeos e documentos).
  const [sectors, completed] = await Promise.all([
    prisma.sector.findMany({
      orderBy: { order: "asc" },
      include: {
        subsectors: {
          orderBy: { order: "asc" },
          include: {
            videos: { select: { id: true, title: true } },
            documents: {
              select: { id: true, name: true, kind: true, sizeBytes: true },
            },
          },
        },
      },
    }),
    // IDs de conteúdo já concluídos pelo usuário.
    prisma.contentProgress.findMany({
      where: { userId, completed: true },
      select: { videoId: true, documentId: true },
    }),
  ]);

  const doneVideoIds = new Set<string>();
  const doneDocIds = new Set<string>();
  for (const c of completed) {
    if (c.videoId) doneVideoIds.add(c.videoId);
    if (c.documentId) doneDocIds.add(c.documentId);
  }

  const sectorBlocks: SectorProgress[] = [];
  const pendingBySector = new Map<string, PendingCategory>();

  let totalVideos = 0;
  let totalDocs = 0;
  let mappedAreas = 0;

  for (const sector of sectors) {
    const areas: AreaProgress[] = [];

    for (const sub of sector.subsectors) {
      const vTotal = sub.videos.length;
      const dTotal = sub.documents.length;
      if (vTotal + dTotal === 0) continue; // subsetor sem conteúdo não é "mapeado".
      mappedAreas += 1;
      totalVideos += vTotal;
      totalDocs += dTotal;

      const vDone = sub.videos.filter((v: { id: string }) => doneVideoIds.has(v.id)).length;
      const dDone = sub.documents.filter((d: { id: string }) => doneDocIds.has(d.id)).length;

      areas.push({
        area: sub.label,
        videos: pct(vDone, vTotal),
        documents: pct(dDone, dTotal),
      });

      // Pendências deste subsetor, acumuladas no setor.
      for (const v of sub.videos) {
        if (doneVideoIds.has(v.id)) continue;
        addPending(pendingBySector, sector.label, {
          id: v.id,
          kind: "VIDEO",
          title: v.title,
          sector: sub.label,
          meta: "Vídeo",
        });
      }
      for (const d of sub.documents) {
        if (doneDocIds.has(d.id)) continue;
        addPending(pendingBySector, sector.label, {
          id: d.id,
          kind: "DOCUMENTO",
          title: d.name,
          sector: sub.label,
          meta: `${d.kind} · ${formatBytes(d.sizeBytes)}`,
        });
      }
    }

    if (areas.length > 0) {
      sectorBlocks.push({ sector: sector.label, icon: sector.icon, areas });
    }
  }

  const totalItems = totalVideos + totalDocs;
  const consumedItems = doneVideoIds.size + doneDocIds.size;
  const overall = pct(consumedItems, totalItems);

  return {
    overall,
    mappedAreas,
    pendingItems: totalItems - consumedItems,
    consumedItems,
    totalItems,
    sectors: sectorBlocks,
    pending: Array.from(pendingBySector.values()),
  };
}

function addPending(
  map: Map<string, PendingCategory>,
  sectorLabel: string,
  item: PendingCategory["items"][number],
): void {
  const existing = map.get(sectorLabel);
  if (existing) {
    (existing.items as (typeof item)[]).push(item);
  } else {
    map.set(sectorLabel, { category: sectorLabel, items: [item] });
  }
}
