import { prisma } from "@/lib/db/prisma";
import type { ItTicket, ItTicketStatus, ItDashboardData, DistributionEntry } from "@/types/it";
import { mapAttachments } from "@/lib/it-data-db";
import { archiveCutoff } from "@/lib/archive-window";

/**
 * Dados reais do setor de Motoristas: chamados (kanban), dashboard e
 * métricas de logística (quilometragem). Espelha a estrutura de TI, mas
 * sobre chamados com destino MOTORISTAS e com os números de rota.
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
function durationLabel(a: Date | null, b: Date | null): string | undefined {
  if (!a || !b) return undefined;
  const ms = b.getTime() - a.getTime();
  if (ms <= 0) return undefined;
  const min = Math.round(ms / 60000);
  const h = Math.floor(min / 60);
  return h > 0 ? `${h}h ${min % 60}m` : `${min}m`;
}

interface DbImageRow {
  id: string;
  filePath: string;
  order: number;
}

interface DbRow {
  id: string;
  code: string;
  title: string;
  description: string | null;
  serviceType: string | null;
  status: string;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  distanceKm: number | null;
  proofPath: string | null;
  resolutionNote: string | null;
  requester: { fullName: string; sector: { label: string } | null } | null;
  assignee: { id: string; fullName: string } | null;
  unit: { label: string } | null;
  images?: DbImageRow[];
}

function mapTicket(row: DbRow): ItTicket {
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    description: row.description ?? undefined,
    category: (row.serviceType ?? "Entrega") as ItTicket["category"],
    requesterName: row.requester?.fullName ?? "—",
    requesterUnit: row.unit?.label ?? "—",
    requesterSector: row.requester?.sector?.label ?? "Logística",
    status: row.status as ItTicketStatus,
    openedAt: row.createdAt.toISOString().slice(0, 10),
    openedLabel: dateLabel(row.createdAt),
    timeLabel: timeLabel(row.createdAt),
    assignee: row.assignee?.fullName,
    assigneeId: row.assignee?.id,
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

const INCLUDE = {
  requester: { select: { fullName: true, sector: { select: { label: true } } } },
  assignee: { select: { id: true, fullName: true } },
  unit: { select: { label: true } },
  images: { select: { id: true, filePath: true, order: true }, orderBy: { order: "asc" } },
} as const;

const DASHBOARD_INCLUDE = {
  requester: { select: { fullName: true, sector: { select: { label: true } } } },
  assignee: { select: { id: true, fullName: true } },
  unit: { select: { label: true } },
} as const;

/**
 * Chamados do QUADRO de Motoristas. Mesma regra do quadro de TI: o concluído
 * fica visível por 30 minutos e depois passa ao Histórico.
 */
export async function getDriverTickets(): Promise<ItTicket[]> {
  const rows = await prisma.ticket.findMany({
    where: {
      destination: "MOTORISTAS",
      status: { not: "CANCELADO" },
      OR: [
        { status: { not: "CONCLUIDO" } },
        { status: "CONCLUIDO", finishedAt: { gte: archiveCutoff() } },
        // Dado legado sem carimbo de conclusão: permanece no quadro.
        { status: "CONCLUIDO", finishedAt: null },
      ],
    },
    orderBy: { createdAt: "desc" },
    include: INCLUDE,
  });
  return (rows as unknown as DbRow[]).map(mapTicket);
}

/** Chamados de Motoristas já arquivados — a lista do botão "Histórico". */
export async function getDriverTicketsHistory(): Promise<ItTicket[]> {
  const rows = await prisma.ticket.findMany({
    where: {
      destination: "MOTORISTAS",
      status: "CONCLUIDO",
      finishedAt: { lt: archiveCutoff() },
    },
    orderBy: { finishedAt: "desc" },
    include: INCLUDE,
  });
  return (rows as unknown as DbRow[]).map(mapTicket);
}

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

export async function getDriverDashboard(): Promise<ItDashboardData> {
  const rows = (await prisma.ticket.findMany({
    where: { destination: "MOTORISTAS", status: { not: "CANCELADO" } },
    include: DASHBOARD_INCLUDE,
  })) as unknown as DbRow[];
  const tickets = rows.map(mapTicket);
  const total = tickets.length;

  const byStatus: Record<ItTicketStatus, number> = {
    PENDENTE: 0,
    ATRIBUIDO: 0,
    EM_ANDAMENTO: 0,
    CONCLUIDO: 0,
  };
  for (const t of tickets) byStatus[t.status] += 1;

  const durations: number[] = [];
  for (const r of rows) {
    if (r.startedAt && r.finishedAt) {
      const ms = r.finishedAt.getTime() - r.startedAt.getTime();
      if (ms > 0) durations.push(ms);
    }
  }
  const avgMin = durations.length
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length / 60000)
    : 0;
  const avgResolution = avgMin > 0 ? `${Math.floor(avgMin / 60)}h ${avgMin % 60}m` : "—";
  const completionRate = total === 0 ? 0 : Math.round((byStatus.CONCLUIDO / total) * 100);

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

export interface DriverLogistics {
  totalKm: number;
  avgKmPerTrip: number;
  deliveriesCompleted: number;
  activeDrivers: number;
}

export async function getDriverLogistics(): Promise<DriverLogistics> {
  const rows = (await prisma.ticket.findMany({
    where: { destination: "MOTORISTAS" },
    select: { status: true, distanceKm: true, assigneeId: true },
  })) as { status: string; distanceKm: number | null; assigneeId: string | null }[];

  const completed = rows.filter((r) => r.status === "CONCLUIDO");
  const kmValues = completed.map((r) => r.distanceKm ?? 0).filter((v) => v > 0);
  const totalKm = kmValues.reduce((a, b) => a + b, 0);
  const avgKmPerTrip = kmValues.length ? totalKm / kmValues.length : 0;
  const activeDrivers = new Set(rows.map((r) => r.assigneeId).filter(Boolean)).size;

  return {
    totalKm: Math.round(totalKm * 10) / 10,
    avgKmPerTrip: Math.round(avgKmPerTrip * 10) / 10,
    deliveriesCompleted: completed.length,
    activeDrivers,
  };
}
