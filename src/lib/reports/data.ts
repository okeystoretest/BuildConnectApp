import { prisma } from "@/lib/db/prisma";
import { dateLabelBR, timeLabelBR } from "@/lib/brasilia";
import { archiveCutoff } from "@/lib/archive-window";
import type { ReportItem, ReportStatus } from "@/types/report";

/**
 * Leitura da Central de Denúncias (DHO).
 *
 * Mesma regra de arquivamento dos quadros de chamados: a denúncia ENCERRADA
 * fica 30 minutos no quadro e depois só é lida no histórico do módulo. O corte
 * é feito na CONSULTA — o que está arquivado não chega ao cliente junto com o
 * quadro.
 *
 * Não existe leitura por denunciante: o canal é anônimo e a tabela não guarda
 * quem escreveu.
 */

interface ReportRow {
  id: string;
  code: string;
  status: ReportStatus;
  targetName: string;
  description: string;
  handlingNote: string | null;
  closedAt: Date | null;
  createdAt: Date;
  attachments: { id: string; filePath: string; order: number }[];
}


function mapReport(row: ReportRow): ReportItem {
  return {
    id: row.id,
    code: row.code,
    status: row.status,
    targetName: row.targetName,
    description: row.description,
    handlingNote: row.handlingNote ?? undefined,
    createdAt: row.createdAt.toISOString(),
    createdLabel: dateLabelBR(row.createdAt),
    timeLabel: timeLabelBR(row.createdAt),
    closedAt: row.closedAt?.toISOString(),
    attachments: [...row.attachments]
      .sort((a, b) => a.order - b.order)
      .map((att) => ({
        id: att.id,
        url: att.filePath,
        name: att.filePath.split("/").pop() ?? "evidencia.webp",
      })),
  };
}

const REPORT_INCLUDE = {
  attachments: { select: { id: true, filePath: true, order: true }, orderBy: { order: "asc" } },
} as const;

/** Denúncias do QUADRO: tudo em aberto + as encerradas há menos de 30 min. */
export async function getReportsBoard(): Promise<ReportItem[]> {
  const rows = await prisma.report.findMany({
    where: {
      OR: [
        { status: { not: "ENCERRADA" } },
        { status: "ENCERRADA", closedAt: { gte: archiveCutoff() } },
        // Encerrada sem carimbo (dado inesperado): fica no quadro em vez de
        // sumir sem nunca ter passado pela janela de 30 min.
        { status: "ENCERRADA", closedAt: null },
      ],
    },
    orderBy: { createdAt: "desc" },
    include: REPORT_INCLUDE,
  });
  return (rows as unknown as ReportRow[]).map(mapReport);
}

/** Denúncias já arquivadas — a lista do botão "Histórico" do módulo. */
export async function getReportsHistory(): Promise<ReportItem[]> {
  const rows = await prisma.report.findMany({
    where: { status: "ENCERRADA", closedAt: { lt: archiveCutoff() } },
    orderBy: { closedAt: "desc" },
    include: REPORT_INCLUDE,
  });
  return (rows as unknown as ReportRow[]).map(mapReport);
}
