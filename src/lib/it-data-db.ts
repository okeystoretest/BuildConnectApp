import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { archiveCutoff } from "@/lib/archive-window";
import type {
  ItTicket,
  ItTicketStatus,
  ItDashboardData,
  DistributionEntry,
  TicketAttachment,
} from "@/types/it";

/**
 * Dados reais do setor de TI: lista de chamados (para o kanban) e as
 * agregações do dashboard. Tudo derivado da tabela Ticket com destino TI.
 */

const PALETTE = ["bg-info", "bg-primary", "bg-accent", "bg-warning", "bg-danger"];

function dateLabel(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

function timeLabel(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function durationLabel(startedAt: Date | null, finishedAt: Date | null): string | undefined {
  if (!startedAt || !finishedAt) return undefined;
  const ms = finishedAt.getTime() - startedAt.getTime();
  if (ms <= 0) return undefined;
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

interface DbImageRow {
  id: string;
  filePath: string;
  order: number;
}

/** Converte as imagens de abertura do chamado em anexos exibíveis. */
export function mapAttachments(images: DbImageRow[] | undefined): TicketAttachment[] {
  if (!images || images.length === 0) return [];
  return [...images]
    .sort((a, b) => a.order - b.order)
    .map((img) => ({
      id: img.id,
      url: img.filePath,
      name: img.filePath.split("/").pop() ?? "anexo.webp",
    }));
}

interface DbTicketRow {
  id: string;
  code: string;
  title: string;
  description: string | null;
  category: string | null;
  status: string;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  distanceKm: number | null;
  proofPath: string | null;
  resolutionNote: string | null;
  requester: { fullName: string; sector: { label: string } | null } | null;
  assignee: { id: string; fullName: string } | null;
  assignedById: string | null;
  unit: { label: string } | null;
  images?: DbImageRow[];
}

function mapTicket(row: DbTicketRow): ItTicket {
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    description: row.description ?? undefined,
    category: (row.category ?? "Equipamentos") as ItTicket["category"],
    requesterName: row.requester?.fullName ?? "—",
    requesterUnit: row.unit?.label ?? "—",
    requesterSector: row.requester?.sector?.label ?? "—",
    status: row.status as ItTicketStatus,
    openedAt: row.createdAt.toISOString().slice(0, 10),
    openedLabel: dateLabel(row.createdAt),
    timeLabel: timeLabel(row.createdAt),
    assignee: row.assignee?.fullName,
    assigneeId: row.assignee?.id,
    assignedById: row.assignedById ?? undefined,
    durationLabel: durationLabel(row.startedAt, row.finishedAt),
    startedAt: row.startedAt?.toISOString(),
    finishedAt: row.finishedAt?.toISOString(),
    proofName: row.proofPath ? row.proofPath.split("/").pop() : undefined,
    proofUrl: row.proofPath ?? undefined,
    distanceKm: row.distanceKm ?? undefined,
    attachments: mapAttachments(row.images),
    resolutionNote: row.resolutionNote ?? undefined,
  };
}

const TICKET_INCLUDE = {
  requester: { select: { fullName: true, sector: { select: { label: true } } } },
  assignee: { select: { id: true, fullName: true } },
  unit: { select: { label: true } },
  images: { select: { id: true, filePath: true, order: true }, orderBy: { order: "asc" } },
} as const;

/** Include enxuto para as agregações do dashboard (sem imagens). */
const DASHBOARD_INCLUDE = {
  requester: { select: { fullName: true, sector: { select: { label: true } } } },
  assignee: { select: { id: true, fullName: true } },
  unit: { select: { label: true } },
} as const;

/** Quem está pedindo o quadro. O corte de privacidade depende disto. */
export interface TicketViewer {
  id: string;
  role: string;
}

/**
 * Recorte de privacidade da consulta, espelhando `lib/ticket-visibility`.
 *
 * ATRIBUIDO e EM_ANDAMENTO só saem do banco para o responsável e para quem fez
 * a atribuição; PENDENTE e CONCLUIDO saem para todo mundo. ADMIN não passa por
 * aqui — é quem exclui e audita.
 *
 * Isto é o que efetivamente esconde o chamado: filtrar depois, no navegador,
 * ainda entregava título, descrição, solicitante, nota técnica e links dos
 * anexos a qualquer pessoa lotada no setor que abrisse o DevTools.
 */
function visibilityFilter(viewer: TicketViewer): Prisma.TicketWhereInput {
  if (viewer.role === "ADMIN") return {};
  return {
    OR: [
      { status: { notIn: ["ATRIBUIDO", "EM_ANDAMENTO"] } },
      { assigneeId: viewer.id },
      { assignedById: viewer.id },
    ],
  };
}

/**
 * Chamados do QUADRO de TI, já recortados para quem está olhando.
 *
 * Concluído continua no quadro por 30 minutos (ver `lib/archive-window`);
 * passado o prazo ele sai daqui e só aparece no Histórico. O corte é feito na
 * consulta — o que está arquivado nem chega ao cliente.
 */
export async function getItTickets(viewer: TicketViewer): Promise<ItTicket[]> {
  const rows = await prisma.ticket.findMany({
    where: {
      destination: "TI",
      status: { not: "CANCELADO" },
      // Dois recortes independentes (janela de arquivamento e privacidade), por
      // isso em AND: dois `OR` no mesmo nível se sobrescreveriam.
      AND: [
        {
          OR: [
            { status: { not: "CONCLUIDO" } },
            { status: "CONCLUIDO", finishedAt: { gte: archiveCutoff() } },
            // Concluído sem carimbo de conclusão (dado legado): mantém no quadro
            // em vez de sumir sem nunca ter passado pela janela de 30 min.
            { status: "CONCLUIDO", finishedAt: null },
          ],
        },
        visibilityFilter(viewer),
      ],
    },
    orderBy: { createdAt: "desc" },
    include: TICKET_INCLUDE,
  });
  return (rows as unknown as DbTicketRow[]).map(mapTicket);
}

/** Chamados de TI já arquivados — a lista do botão "Histórico". */
export async function getItTicketsHistory(): Promise<ItTicket[]> {
  const rows = await prisma.ticket.findMany({
    where: { destination: "TI", status: "CONCLUIDO", finishedAt: { lt: archiveCutoff() } },
    orderBy: { finishedAt: "desc" },
    include: TICKET_INCLUDE,
  });
  return (rows as unknown as DbTicketRow[]).map(mapTicket);
}

/** Monta as distribuições (contagem + percentual + cor) a partir de rótulos. */
function distribute(labels: string[]): DistributionEntry[] {
  const total = labels.length;
  const counts = new Map<string, number>();
  for (const l of labels) counts.set(l, (counts.get(l) ?? 0) + 1);
  return Array.from(counts.entries()).map(([label, count], i) => ({
    label,
    count,
    percent: total === 0 ? 0 : Math.round((count / total) * 100),
    color: PALETTE[i % PALETTE.length] ?? "bg-info",
  }));
}

export async function getItDashboard(): Promise<ItDashboardData> {
  const rows = await prisma.ticket.findMany({
    where: { destination: "TI", status: { not: "CANCELADO" } },
    include: DASHBOARD_INCLUDE,
  });
  const tickets = (rows as unknown as DbTicketRow[]).map(mapTicket);
  const total = tickets.length;

  const byStatus: Record<ItTicketStatus, number> = {
    PENDENTE: 0,
    ATRIBUIDO: 0,
    EM_ANDAMENTO: 0,
    CONCLUIDO: 0,
  };
  for (const t of tickets) byStatus[t.status] += 1;

  // Tempo médio de resolução dos concluídos com cronometragem.
  const durationsMs: number[] = [];
  for (const row of rows as unknown as DbTicketRow[]) {
    if (row.startedAt && row.finishedAt) {
      const ms = row.finishedAt.getTime() - row.startedAt.getTime();
      if (ms > 0) durationsMs.push(ms);
    }
  }
  const avgMs = durationsMs.length
    ? durationsMs.reduce((a, b) => a + b, 0) / durationsMs.length
    : 0;
  const avgMin = Math.round(avgMs / 60000);
  const avgResolution = avgMin > 0 ? `${Math.floor(avgMin / 60)}h ${avgMin % 60}m` : "—";

  const completionRate = total === 0 ? 0 : Math.round((byStatus.CONCLUIDO / total) * 100);

  // Unidade que mais solicita e maior resolvedor.
  const unitCounts = new Map<string, number>();
  for (const t of tickets) unitCounts.set(t.requesterUnit, (unitCounts.get(t.requesterUnit) ?? 0) + 1);
  const topUnit = [...unitCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";

  const resolverCounts = new Map<string, number>();
  for (const t of tickets) {
    if (t.status === "CONCLUIDO" && t.assignee) {
      resolverCounts.set(t.assignee, (resolverCounts.get(t.assignee) ?? 0) + 1);
    }
  }
  const topResolver = [...resolverCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";

  return {
    total,
    byStatus,
    avgResolution,
    completionRate,
    topUnit,
    topResolver,
    byCategory: distribute(tickets.map((t) => t.category)),
    byUnit: distribute(tickets.map((t) => t.requesterUnit)),
    categoryByUnit: distribute(tickets.map((t) => `${t.requesterUnit} - ${t.category}`)),
  };
}
