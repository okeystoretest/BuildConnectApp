import type { ProgressSummary, SectorProgress } from "@/types/content";

/**
 * Dados de demonstração remanescentes (progresso por área).
 * Saem quando /progresso migrar para o Prisma.
 */

export const PROGRESS_SUMMARY: ProgressSummary = {
  overall: 48,
  mappedAreas: 12,
  pendingItems: 78,
};

export const SECTOR_PROGRESS: readonly SectorProgress[] = [
  {
    sector: "Comercial",
    icon: "Store",
    areas: [
      { area: "OKEY - Vitrine", videos: 67, documents: 100 },
      { area: "Lov Club - Vitrine", videos: 67, documents: 0 },
      { area: "Vendas", videos: 67, documents: 14 },
    ],
  },
  {
    sector: "Produção",
    icon: "Settings",
    areas: [
      { area: "Criação", videos: 67, documents: 86 },
      { area: "PCP", videos: 67, documents: 14 },
      { area: "Almoxarifado", videos: 67, documents: 14 },
      { area: "Corte", videos: 67, documents: 14 },
      { area: "Acabamento", videos: 67, documents: 14 },
      { area: "Revisão", videos: 67, documents: 14 },
      { area: "Externo", videos: 67, documents: 14 },
    ],
  },
  {
    sector: "Logística",
    icon: "Truck",
    areas: [
      { area: "Estoque", videos: 67, documents: 86 },
      { area: "Motoristas", videos: 67, documents: 14 },
    ],
  },
];
