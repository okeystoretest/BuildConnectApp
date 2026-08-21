import { prisma } from "@/lib/db/prisma";
import { formatBytes } from "@/lib/utils";
import type { HrDocument, IntegrationMap } from "@/types/hr";

/**
 * Documentos do RH e mapas de integração, reais.
 *
 * Documentos do RH reusam a tabela Document sob o subsetor "rh" — assim o
 * upload já existente (uploadSectorDocument com slug "rh") alimenta esta
 * tela sem schema novo.
 */

export async function getHrDocuments(): Promise<HrDocument[]> {
  const sub = await prisma.subsector.findUnique({
    where: { slug: "rh" },
    select: { id: true },
  });
  if (!sub) return [];

  const docs = await prisma.document.findMany({
    where: { subsectorId: sub.id },
    orderBy: { order: "asc" },
  });

  return docs.map((d: { id: string; name: string; sizeBytes: number; kind: string; filePath: string }) => ({
    id: d.id,
    name: d.name,
    size: formatBytes(d.sizeBytes),
    // A UI de RH só estiliza PDF/DOCX/XLSX; PNG cai em PDF-like neutro.
    kind: (d.kind === "PNG" ? "PDF" : d.kind) as HrDocument["kind"],
    filePath: d.filePath,
  }));
}

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
