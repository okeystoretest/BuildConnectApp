import type { TicketStatus } from "@/types/content";

/**
 * Configuração de apresentação dos status de chamado (rótulo e cor).
 * É config de UI — não é dado fictício.
 */

export const TICKET_STATUS_LABEL: Record<TicketStatus, string> = {
  ABERTO: "Aberto",
  EM_ANDAMENTO: "Em andamento",
  RESOLVIDO: "Resolvido",
};

export const TICKET_STATUS_TONE: Record<TicketStatus, "warning" | "accent" | "primary"> = {
  ABERTO: "warning",
  EM_ANDAMENTO: "accent",
  RESOLVIDO: "primary",
};
