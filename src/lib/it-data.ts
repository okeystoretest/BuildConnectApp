import type { ItDashboardData, ItTicket, ItTicketStatus } from "@/types/it";

export const IT_TICKETS: readonly ItTicket[] = [
  {
    id: "2051",
    code: "#2051",
    title: "Instalar VPN na filial",
    category: "Internet e Rede",
    requesterName: "Carlos Mendes",
    requesterUnit: "OKEY Store (Iguatemi)",
    requesterSector: "Comercial",
    status: "PENDENTE",
    openedAt: "2026-07-04",
    openedLabel: "04/07/2026",
    timeLabel: "08:42",
  },
  {
    id: "2050",
    code: "#2050",
    title: "Troca de teclado — Recepção",
    category: "Equipamentos",
    requesterName: "Fernanda Lima",
    requesterUnit: "Lov Club (Centro Fashion)",
    requesterSector: "Comercial",
    status: "PENDENTE",
    openedAt: "2026-07-05",
    openedLabel: "05/07/2026",
    timeLabel: "09:15",
  },
  {
    id: "2045",
    code: "#2045",
    title: "Notebook não liga após atualização",
    category: "Equipamentos",
    requesterName: "Ana Ribeiro",
    requesterUnit: "Unidade 1",
    requesterSector: "Logística",
    status: "EM_ANDAMENTO",
    openedAt: "2026-07-01",
    openedLabel: "01/07/2026",
    timeLabel: "14:02",
  },
  {
    id: "2043",
    code: "#2043",
    title: "Configurar e-mail corporativo",
    category: "Aplicativos",
    requesterName: "Gustavo Rocha",
    requesterUnit: "Unidade 3",
    requesterSector: "Logística",
    status: "EM_ANDAMENTO",
    openedAt: "2026-07-03",
    openedLabel: "03/07/2026",
    timeLabel: "11:20",
  },
  {
    id: "2032",
    code: "#2032",
    title: "Reset de senha",
    category: "Acessos e Segurança",
    requesterName: "Beatriz Souza",
    requesterUnit: "Unidade 1",
    requesterSector: "TI",
    status: "CONCLUIDO",
    openedAt: "2026-07-05",
    openedLabel: "05/07/2026",
    timeLabel: "09:00",
    durationLabel: "9h 17m",
  },
];

export const IT_STATUS_LABEL: Record<ItTicketStatus, string> = {
  PENDENTE: "Pendente",
  ATRIBUIDO: "Atribuído",
  EM_ANDAMENTO: "Em andamento",
  CONCLUIDO: "Concluído",
};

export const IT_STATUS_DOT: Record<ItTicketStatus, string> = {
  PENDENTE: "bg-warning",
  ATRIBUIDO: "bg-info",
  EM_ANDAMENTO: "bg-accent",
  CONCLUIDO: "bg-primary",
};

export const IT_STATUS_TONE: Record<ItTicketStatus, "warning" | "info" | "accent" | "primary"> = {
  PENDENTE: "warning",
  ATRIBUIDO: "info",
  EM_ANDAMENTO: "accent",
  CONCLUIDO: "primary",
};

/**
 * Cor semântica das categorias de chamado.
 *
 * A tag de categoria era cinza para todas — o que fazia o quadro inteiro
 * parecer homogêneo e obrigava a LER cada card para saber do que se tratava.
 * Aqui cada assunto ganha um tom com significado: risco/segurança em vermelho,
 * infraestrutura em amarelo, equipamento e rede em azul, entrega e onboarding
 * no verde da marca.
 *
 * Cobre as categorias de Retaguarda (TI) e os tipos de serviço de Motoristas,
 * que ocupam a mesma tag no card. O que não estiver mapeado cai em neutro —
 * uma categoria nova nunca quebra a renderização.
 */
const CATEGORY_TONE: Record<string, "neutral" | "primary" | "accent" | "warning" | "info" | "danger"> = {
  // Retaguarda (TI)
  "Equipamentos": "info",
  "Aplicativos": "accent",
  "Planilhas e Documentos": "primary",
  "Internet e Rede": "warning",
  "Sites e Sistemas Internos": "accent",
  "Acessos e Segurança": "danger",
  "Solicitação de Novos Recursos": "primary",
  "Desenvolvimento": "info",
  "On-Boarding": "primary",
  "Off-Boarding": "warning",
  // Motoristas (tipo de serviço)
  "Entrega": "primary",
  "Coleta": "info",
  "Transferência": "accent",
  "Compra": "warning",
  "Outro": "neutral",
};

export function itCategoryTone(
  category: string,
): "neutral" | "primary" | "accent" | "warning" | "info" | "danger" {
  return CATEGORY_TONE[category] ?? "neutral";
}

export const IT_STATUS_ORDER: readonly ItTicketStatus[] = [
  "PENDENTE",
  "ATRIBUIDO",
  "EM_ANDAMENTO",
  "CONCLUIDO",
];

export const IT_DASHBOARD: ItDashboardData = {
  total: 5,
  byStatus: { PENDENTE: 2, ATRIBUIDO: 0, EM_ANDAMENTO: 2, CONCLUIDO: 1 },
  avgResolution: "9h 17m",
  completionRate: 20,
  topUnit: "Unidade 1",
  topResolver: "Beatriz Souza",
  byCategory: [
    { label: "Equipamentos", count: 2, percent: 40, color: "bg-info" },
    { label: "Internet e Rede", count: 1, percent: 20, color: "bg-primary" },
    { label: "Aplicativos", count: 1, percent: 20, color: "bg-accent" },
    { label: "Acessos e Segurança", count: 1, percent: 20, color: "bg-warning" },
  ],
  byUnit: [
    { label: "Unidade 1", count: 2, percent: 40, color: "bg-warning" },
    { label: "OKEY Store (Iguatemi)", count: 1, percent: 20, color: "bg-info" },
    { label: "Lov Club (Centro Fashion)", count: 1, percent: 20, color: "bg-accent" },
    { label: "Unidade 3", count: 1, percent: 20, color: "bg-primary" },
  ],
  categoryByUnit: [
    { label: "Unidade 1 - Equipamentos", count: 1, percent: 20, color: "bg-info" },
    { label: "Unidade 1 - Acessos e Segurança", count: 1, percent: 20, color: "bg-warning" },
    { label: "OKEY Store (Iguatemi) - Internet e Rede", count: 1, percent: 20, color: "bg-primary" },
    { label: "Lov Club (Centro Fashion) - Equipamentos", count: 1, percent: 20, color: "bg-info" },
    { label: "Unidade 3 - Aplicativos", count: 1, percent: 20, color: "bg-accent" },
  ],
};

export const IT_ASSIGNEES = ["Todos os responsáveis", "Beatriz Souza", "Diego Alves"] as const;
export const IT_MONTHS = ["Julho 2026", "Junho 2026", "Maio 2026"] as const;
