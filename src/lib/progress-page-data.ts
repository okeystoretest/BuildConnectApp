import { prisma } from "@/lib/db/prisma";
import { resolveAccessibleSlugs } from "@/lib/auth/access";
import { TRACKED_SUBSECTOR } from "@/lib/progress-scope";
import type { Role } from "@/types";
import type { SectorProgress, AreaProgress } from "@/types/content";
import type { PendingCategory } from "@/lib/pending-content";
import { formatBytes } from "@/lib/utils";
import { COMPREHENSION_PASS_MIN } from "@/lib/video-comprehension";

/**
 * Agregação de progresso do colaborador para a tela "Meu Progresso".
 *
 * Só entra o conteúdo dos subsetores a que o usuário PERTENCE — o mesmo
 * recorte da barra lateral (`resolveAccessibleSlugs`: subsetores marcados no
 * cadastro ou, sem marcação, todos os do setor de lotação). O Admin, que
 * alcança tudo, vê tudo. Vitrines nunca entram (`TRACKED_SUBSECTOR`).
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

/** Nada a mostrar: quem não tem setor de lotação não tem material a concluir. */
const EMPTY_PROGRESS: ProgressPageData = {
  overall: 0,
  mappedAreas: 0,
  pendingItems: 0,
  consumedItems: 0,
  totalItems: 0,
  sectors: [],
  pending: [],
};

export async function getProgressPageData(userId: string, role: Role): Promise<ProgressPageData> {
  // `null` = Admin, sem recorte de setor.
  const slugs = await resolveAccessibleSlugs(userId, role);

  /*
   * Recorte por SETOR DE LOTAÇÃO, somado ao de subsetores acessíveis.
   *
   * Os dois são necessários e dizem coisas diferentes. `resolveAccessibleSlugs`
   * responde "o que esta pessoa pode ABRIR", e um vínculo de subsetor pode
   * atravessar setores — era isso que inflava o denominador: quem tinha um
   * subsetor marcado fora da própria lotação carregava o material inteiro
   * daquele outro setor como pendência sua, e 40 itens viravam 120.
   *
   * Progresso é sobre o que a pessoa PRECISA concluir, que é o material do
   * setor em que ela está lotada. O Admin, que não tem lotação para recortar,
   * continua vendo tudo.
   */
  const lotacao =
    slugs === null
      ? null
      : ((
          await prisma.user.findUnique({ where: { id: userId }, select: { sectorId: true } })
        )?.sectorId ?? null);

  // Não-Admin sem setor de lotação não tem material a concluir. Sem esta
  // guarda o filtro sumiria e a pessoa herdaria o acervo da empresa inteira.
  if (slugs !== null && lotacao === null) return EMPTY_PROGRESS;

  const inScope = {
    ...TRACKED_SUBSECTOR,
    ...(slugs === null ? {} : { slug: { in: slugs }, sectorId: lotacao as string }),
  };

  // Estrutura de setores → subsetores com seu conteúdo (vídeos e documentos).
  const [sectors, completed, rejected, endedRows] = await Promise.all([
    prisma.sector.findMany({
      orderBy: { order: "asc" },
      include: {
        subsectors: {
          where: inScope,
          orderBy: { order: "asc" },
          include: {
            videos: {
              select: {
                id: true,
                title: true,
                filePath: true,
                thumbnailPath: true,
                transcriptText: true,
              },
            },
            documents: {
              select: { id: true, name: true, kind: true, sizeBytes: true, filePath: true },
            },
          },
        },
      },
    }),
    // IDs de conteúdo já concluídos pelo usuário. Só nos subsetores dele: o
    // que foi concluído num setor de que a pessoa saiu não conta no total.
    prisma.contentProgress.findMany({
      where: {
        userId,
        completed: true,
        OR: [{ video: { subsector: inScope } }, { document: { subsector: inScope } }],
      },
      select: { videoId: true, documentId: true },
    }),
    // Reprovações por vídeo, para a sinalização de "Refazer".
    prisma.videoComprehension.findMany({
      where: { userId, grade: { lt: COMPREHENSION_PASS_MIN } },
      select: { videoId: true },
    }),
    // Vídeos que já chegaram ao fim: o player reabre direto na pergunta.
    prisma.contentProgress.findMany({
      where: { userId, endedAt: { not: null } },
      select: { videoId: true },
    }),
  ]);

  const rejectionsByVideo = new Map<string, number>();
  for (const r of rejected) {
    rejectionsByVideo.set(r.videoId, (rejectionsByVideo.get(r.videoId) ?? 0) + 1);
  }
  const endedVideoIds = new Set(
    endedRows.map((r) => r.videoId).filter((id): id is string => Boolean(id)),
  );

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
          subsectorSlug: sub.slug,
          filePath: v.filePath ?? undefined,
          thumbnailPath: v.thumbnailPath ?? undefined,
          transcriptText: v.transcriptText ?? undefined,
          ended: endedVideoIds.has(v.id),
          rejections: rejectionsByVideo.get(v.id) ?? 0,
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
          subsectorSlug: sub.slug,
          filePath: d.filePath ?? undefined,
          rejections: 0,
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
