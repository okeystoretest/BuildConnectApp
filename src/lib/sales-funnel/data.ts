import { prisma } from "@/lib/db/prisma";
import { resolveAppScope } from "@/lib/app-scope";
import { can } from "@/lib/permissions";
import { calcularAscendente, distribuirCanais } from "./math";
import type { FunnelInput } from "./types";
import type { Role } from "@/types";
import type {
  SalesFunnelData,
  SalesFunnelDetail,
  SalesFunnelListItem,
} from "@/types/sales-funnel";

/**
 * Leitura do Funil de Vendas.
 *
 * Os números dos cards são calculados AQUI, no servidor, pelo mesmo motor que
 * a tela usa. Guardar o resultado no banco criaria uma segunda verdade que
 * envelhece na primeira vez que alguém corrigir uma taxa.
 */

/**
 * Decimal do Prisma → centavos inteiros, que é a moeda do motor.
 *
 * Passa por string, e não por `Number(decimal)`: o Decimal do Prisma é um
 * objeto, e converter direto depende de uma coerção implícita que já mudou
 * entre versões. `toString()` é o contrato estável.
 */
function paraCentavos(valor: { toString(): string }): number {
  return Math.round(Number(valor.toString()) * 100);
}

/** Centavos inteiros → string aceita pelo Decimal(14,2) do Prisma. */
export function centavosParaDecimal(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function toFunnelInput(detail: SalesFunnelDetail): FunnelInput {
  return {
    goalCents: detail.goalCents,
    ticketCents: detail.ticketCents,
    stages: detail.stages.map((s) => ({ id: s.id, label: s.label, rate: s.rate })),
    channels: detail.channels.map((c) => ({ id: c.id, label: c.label, share: c.share })),
  };
}

export async function getSalesFunnelData(
  slug: string,
  role: Role,
): Promise<SalesFunnelData | null> {
  const scope = await resolveAppScope(slug);
  if (!scope || !scope.funnelEnabled) return null;

  const rows = await prisma.salesFunnel.findMany({
    where: { subsectorId: scope.id },
    orderBy: [{ referenceDate: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      name: true,
      referenceDate: true,
      goalAmount: true,
      averageTicket: true,
      status: true,
      createdBy: { select: { fullName: true } },
      stages: {
        orderBy: { order: "asc" },
        select: { id: true, label: true, conversionRate: true },
      },
    },
  });

  const funnels: SalesFunnelListItem[] = rows.map((row) => {
    const goalCents = paraCentavos(row.goalAmount);
    const ticketCents = paraCentavos(row.averageTicket);
    const resultado = calcularAscendente({
      goalCents,
      ticketCents,
      stages: row.stages.map((s) => ({ id: s.id, label: s.label, rate: s.conversionRate })),
      channels: [],
    });
    return {
      id: row.id,
      name: row.name,
      referenceDate: row.referenceDate.toISOString(),
      goalCents,
      ticketCents,
      status: row.status,
      requiredConversions: resultado.requiredConversions,
      topVolume: resultado.topVolume,
      authorName: row.createdBy?.fullName,
    };
  });

  return {
    scopeSlug: scope.slug,
    scopeLabel: scope.label,
    inherited: scope.inherited,
    canManage: can(role, "funnel.manage"),
    funnels,
  };
}

export async function getSalesFunnelDetail(
  slug: string,
  funnelId: string,
): Promise<SalesFunnelDetail | null> {
  const scope = await resolveAppScope(slug);
  if (!scope || !scope.funnelEnabled) return null;

  const row = await prisma.salesFunnel.findFirst({
    // O subsetor no WHERE é o que impede ler o funil de outro setor pelo id.
    where: { id: funnelId, subsectorId: scope.id },
    select: {
      id: true,
      name: true,
      referenceDate: true,
      goalAmount: true,
      averageTicket: true,
      status: true,
      notes: true,
      createdBy: { select: { fullName: true } },
      stages: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          order: true,
          label: true,
          conversionRate: true,
          transitionRule: true,
        },
      },
      channels: {
        orderBy: { order: "asc" },
        select: { id: true, order: true, label: true, strategy: true, share: true },
      },
      scenarios: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          name: true,
          notes: true,
          ticketPercent: true,
          topPercent: true,
          rates: { select: { stageId: true, conversionRate: true } },
        },
      },
    },
  });
  if (!row) return null;

  const goalCents = paraCentavos(row.goalAmount);
  const ticketCents = paraCentavos(row.averageTicket);
  const stages = row.stages.map((s) => ({
    id: s.id,
    order: s.order,
    label: s.label,
    rate: s.conversionRate,
    transitionRule: s.transitionRule ?? undefined,
  }));
  const channels = row.channels.map((c) => ({
    id: c.id,
    order: c.order,
    label: c.label,
    strategy: c.strategy ?? undefined,
    share: c.share,
  }));

  const resultado = distribuirCanais(
    calcularAscendente({
      goalCents,
      ticketCents,
      stages: stages.map((s) => ({ id: s.id, label: s.label, rate: s.rate })),
      channels: [],
    }),
    channels.map((c) => ({ id: c.id, label: c.label, share: c.share })),
  );

  return {
    id: row.id,
    name: row.name,
    referenceDate: row.referenceDate.toISOString(),
    goalCents,
    ticketCents,
    status: row.status,
    notes: row.notes ?? undefined,
    authorName: row.createdBy?.fullName,
    requiredConversions: resultado.requiredConversions,
    topVolume: resultado.topVolume,
    stages,
    channels,
    scenarios: row.scenarios.map((s) => ({
      id: s.id,
      name: s.name,
      notes: s.notes ?? undefined,
      ticketPercent: s.ticketPercent,
      topPercent: s.topPercent,
      rates: Object.fromEntries(s.rates.map((r) => [r.stageId, r.conversionRate])),
    })),
  };
}
