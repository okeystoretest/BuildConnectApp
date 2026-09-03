import type { ItTicketStatus } from "@/types/it";

/**
 * Configuração de apresentação dos quadros de chamados: rótulo, cor e ordem
 * das colunas por status, e o tom semântico de cada categoria.
 *
 * Só constantes de UI. Os chamados e as agregações do dashboard vêm do banco
 * (`lib/it-data-db`, `lib/driver-data-db`) — o acervo de demonstração que
 * morava aqui, com nomes e unidades inventados, foi removido.
 */

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
