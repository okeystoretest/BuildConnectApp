import { prisma } from "@/lib/db/prisma";

/**
 * Escopo de aplicativos de um subsetor.
 *
 * Subsetor com `appsSource` não tem base própria: ele lê e escreve na base do
 * subsetor de origem. É assim que Marketing enxerga (e alimenta) exatamente os
 * mesmos aplicativos e o mesmo cronograma de Vendas — uma base só, sem cópia.
 */
export interface AppScope {
  /** Id do subsetor que realmente guarda os dados. */
  id: string;
  slug: string;
  label: string;
  scheduleEnabled: boolean;
  funnelEnabled: boolean;
  /** true quando o subsetor consultado herda de outro. */
  inherited: boolean;
}

export async function resolveAppScope(slug: string): Promise<AppScope | null> {
  const sub = await prisma.subsector.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      label: true,
      scheduleEnabled: true,
      funnelEnabled: true,
      appsSource: {
        select: {
          id: true,
          slug: true,
          label: true,
          scheduleEnabled: true,
          funnelEnabled: true,
        },
      },
    },
  });
  if (!sub) return null;

  if (sub.appsSource) {
    return {
      id: sub.appsSource.id,
      slug: sub.appsSource.slug,
      label: sub.appsSource.label,
      scheduleEnabled: sub.appsSource.scheduleEnabled,
      funnelEnabled: sub.appsSource.funnelEnabled,
      inherited: true,
    };
  }

  return {
    id: sub.id,
    slug: sub.slug,
    label: sub.label,
    scheduleEnabled: sub.scheduleEnabled,
    funnelEnabled: sub.funnelEnabled,
    inherited: false,
  };
}
