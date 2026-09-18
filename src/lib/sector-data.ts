import { prisma } from "@/lib/db/prisma";
import { formatBytes } from "@/lib/utils";
import { resolveAppScope } from "@/lib/app-scope";
import { sortInstrucoes } from "@/lib/instrucoes-video";
import type {
  ComprehensionStatus,
  SectorContent,
  VideoItem,
  PhotoItem,
  DocumentItem,
  LinkItem,
} from "@/types/sector";

/**
 * Monta o SectorContent de um subsetor a partir de dados reais, já com o
 * estado por usuário (vídeos assistidos, documentos/instruções lidos) e o
 * percentual de conclusão da área.
 *
 * Mantém exatamente a forma que a SectorPage e seus filhos consomem — a
 * migração troca só a origem dos dados, não os componentes.
 */

/** Slugs de subsetores para generateStaticParams (exceto páginas dedicadas). */
const DEDICATED_SLUGS = new Set(["ti", "rh", "motoristas"]);

export async function getSectorSlugs(): Promise<string[]> {
  const subs = await prisma.subsector.findMany({ select: { slug: true } });
  return subs.map((s: { slug: string }) => s.slug).filter((slug: string) => !DEDICATED_SLUGS.has(slug));
}

export async function getSectorContent(
  slug: string,
  userId: string,
): Promise<SectorContent | null> {
  const sub = await prisma.subsector.findUnique({
    where: { slug },
    include: {
      sector: { select: { label: true } },
      videos: { orderBy: { order: "asc" } },
      photos: { orderBy: { order: "asc" } },
      documents: { orderBy: { order: "asc" } },
    },
  });

  if (!sub) return null;

  // Aplicativos vêm do subsetor de ESCOPO: com herança configurada, Marketing
  // lista exatamente os mesmos atalhos de Vendas, sem cópia de registro.
  const scope = await resolveAppScope(slug);
  const linkRows = await prisma.externalLink.findMany({
    where: { subsectorId: scope?.id ?? sub.id },
    orderBy: { order: "asc" },
    select: { id: true, label: true, url: true, iconPath: true },
  });

  // Estado do usuário: o que já concluiu (ou chegou ao fim) neste subsetor, e
  // as respostas de compreensão que já enviou.
  const [progress, comprehensions] = await Promise.all([
    prisma.contentProgress.findMany({
      where: {
        userId,
        OR: [
          { video: { subsectorId: sub.id } },
          { document: { subsectorId: sub.id } },
        ],
      },
      select: { videoId: true, documentId: true, completed: true, endedAt: true },
    }),
    prisma.videoComprehension.findMany({
      where: { userId, video: { subsectorId: sub.id } },
      select: { videoId: true, gradedAt: true },
    }),
  ]);

  const doneVideo = new Set<string>();
  const doneDoc = new Set<string>();
  const endedVideo = new Set<string>();
  for (const p of progress) {
    if (p.videoId) {
      if (p.completed) doneVideo.add(p.videoId);
      if (p.endedAt) endedVideo.add(p.videoId);
    }
    if (p.documentId && p.completed) doneDoc.add(p.documentId);
  }
  const comprehensionOf = new Map<string, ComprehensionStatus>();
  for (const c of comprehensions) {
    comprehensionOf.set(c.videoId, c.gradedAt ? "AVALIADA" : "ENVIADA");
  }

  // Vídeos separados por tipo (VIDEO/INSTRUCAO vão para "videos"; WORKSHOP à parte).
  const videos: VideoItem[] = [];
  const workshops: VideoItem[] = [];
  for (const v of sub.videos as Array<{
    id: string;
    title: string;
    isNew: boolean;
    tags: string[];
    kind: string;
    filePath: string | null;
    thumbnailPath: string | null;
    transcriptPath: string | null;
    transcriptText: string | null;
  }>) {
    const item: VideoItem = {
      id: v.id,
      title: v.title,
      watched: doneVideo.has(v.id),
      ended: endedVideo.has(v.id),
      comprehension: comprehensionOf.get(v.id),
      isNew: v.isNew,
      tags: v.tags,
      filePath: v.filePath ?? undefined,
      thumbnailPath: v.thumbnailPath ?? undefined,
      transcriptPath: v.transcriptPath ?? undefined,
      transcriptText: v.transcriptText ?? undefined,
    };
    if (v.kind === "WORKSHOP") workshops.push(item);
    else videos.push(item);
  }

  // Instruções em Vídeo listam em ordem alfabética; Coleção e Workshop
  // (VIDEO) seguem a ordem de envio. O `kind` está no registro, não no item,
  // então a decisão é tomada aqui, onde ele ainda existe.
  const instrucoes = sub.kind === "PADRAO";
  const orderedVideos = instrucoes ? sortInstrucoes(videos) : videos;

  const photos: PhotoItem[] = sub.photos.map((p: { id: string; title: string; filePath: string }) => ({
    id: p.id,
    title: p.title,
    // Sem gradiente fictício: foto real vem por filePath.
    swatch: "from-surface-2 to-surface",
    filePath: p.filePath,
  }));

  const documents: DocumentItem[] = sub.documents.map((d: { id: string; name: string; sizeBytes: number; kind: DocumentItem["kind"]; tags: string[]; filePath: string }) => ({
    id: d.id,
    name: d.name,
    size: formatBytes(d.sizeBytes),
    kind: d.kind,
    tags: d.tags,
    filePath: d.filePath,
  }));

  const links: LinkItem[] = linkRows.map(
    (l: { id: string; label: string; url: string; iconPath: string | null }) => ({
      id: l.id,
      label: l.label,
      url: l.url,
      iconPath: l.iconPath ?? undefined,
    }),
  );

  // Conclusão da área: concluídos ÷ total (vídeos + documentos). Vitrine não
  // tem conclusão — é visualização casual.
  const total = sub.videos.length + sub.documents.length;
  const done = doneVideo.size + doneDoc.size;
  const completion =
    sub.kind === "VITRINE" ? null : total === 0 ? 0 : Math.round((done / total) * 100);

  return {
    slug: sub.slug,
    name: sub.label,
    parent: sub.sector.label,
    kind: sub.kind,
    description:
      sub.kind === "VITRINE"
        ? "Galeria, vídeos, workshops e material de apoio da vitrine."
        : "Conteúdos de integração e reciclagem da área.",
    completion,
    photos,
    videos: orderedVideos,
    workshops,
    documents,
    links,
    appsSourceLabel: scope?.inherited ? scope.label : undefined,
  };
}
