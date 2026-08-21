import type { ItDashboardData } from "@/types/it";

/**
 * Métricas logísticas da Central de Motoristas.
 * Mesma forma do dashboard de TI, adaptada à realidade de rotas.
 */
export const DRIVER_DASHBOARD: ItDashboardData = {
  total: 5,
  byStatus: { PENDENTE: 2, ATRIBUIDO: 1, EM_ANDAMENTO: 1, CONCLUIDO: 1 },
  avgResolution: "2h 40m",
  completionRate: 20,
  topUnit: "Unidade 1",
  topResolver: "João Motta",
  byCategory: [
    { label: "Entrega", count: 2, percent: 40, color: "bg-info" },
    { label: "Coleta", count: 1, percent: 20, color: "bg-primary" },
    { label: "Transferência", count: 1, percent: 20, color: "bg-accent" },
    { label: "Manutenção", count: 1, percent: 20, color: "bg-warning" },
  ],
  byUnit: [
    { label: "Unidade 1", count: 2, percent: 40, color: "bg-warning" },
    { label: "Unidade 2", count: 1, percent: 20, color: "bg-info" },
    { label: "OKEY Store (Iguatemi)", count: 1, percent: 20, color: "bg-accent" },
    { label: "Lov Club (Centro Fashion)", count: 1, percent: 20, color: "bg-primary" },
  ],
  categoryByUnit: [
    { label: "Unidade 1 - Entrega", count: 1, percent: 20, color: "bg-info" },
    { label: "Unidade 1 - Manutenção", count: 1, percent: 20, color: "bg-warning" },
    { label: "Unidade 2 - Coleta", count: 1, percent: 20, color: "bg-primary" },
    { label: "OKEY Store (Iguatemi) - Transferência", count: 1, percent: 20, color: "bg-accent" },
    { label: "Lov Club (Centro Fashion) - Entrega", count: 1, percent: 20, color: "bg-info" },
  ],
};

/** Métricas específicas de rota, exibidas além dos KPIs padrão. */
export const DRIVER_LOGISTICS = {
  totalKm: 148.6,
  avgKmPerTrip: 29.7,
  deliveriesCompleted: 1,
  activeDrivers: 3,
};
