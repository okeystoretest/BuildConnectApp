import { prisma } from "@/lib/db/prisma";
import { TRACKED_SUBSECTOR, trackedSubsectorFilterOf } from "@/lib/progress-scope";
import type { Role } from "@/types";
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
  pending: PendingCategory[];
}

function pct(done: number, total: number): number {
  return total === 0 ? 0 : Math.round((done / total) * 100);
}

/*
 * Não há mais um `EMPTY_PROGRESS` com saída antecipada: quem não tem lotação
 * recebe um filtro de subsetores vazio, nenhum subsetor casa, e a agregação
 * abaixo já devolve zeros e lista vazia — o mesmo resultado, sem um segundo
 * caminho para manter em dia.
 */
export async function getProgressPageData(userId: string, role: Role): Promise<ProgressPageData> {
  /*
   * O que esta pessoa PRECISA concluir.
   *
   * `trackedSubsectorFilterOf` resolve os três casos de uma vez: a marcação de
   * subsetor do cadastro, o recorte pelo setor de lotação (um vínculo pode
   * atravessar setores, e sem o recorte quem tinha marcação fora da própria
   * lotação carregava o acervo daquele outro setor — 40 itens viravam 120) e
   * quem não tem lotação, que recebe lista vazia em vez de herdar a empresa.
   *
   * É a MESMA régua de "Meu Setor" e do "Histórico do Colaborador": três
   * telas que mostram o mesmo número para a mesma pessoa.
   *
   * O Admin, que alcança tudo e não tem lotação a recortar, continua vendo
   * tudo — a única exceção, e ela fica escrita aqui em vez de escondida na
   * régua.
   */
  const inScope = role === "ADMIN" ? TRACKED_SUBSECTOR : await trackedSubsectorFilterOf(userId);

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

  const pendingBySector = new Map<string, PendingCategory>();

  let totalVideos = 0;
  let totalDocs = 0;
  let mappedAreas = 0;

  for (const sector of sectors) {
    for (const sub of sector.subsectors) {
      const vTotal = sub.videos.length;
      const dTotal = sub.documents.length;
      if (vTotal + dTotal === 0) continue; // subsetor sem conteúdo não é "mapeado".
      mappedAreas += 1;
      totalVideos += vTotal;
      totalDocs += dTotal;

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
