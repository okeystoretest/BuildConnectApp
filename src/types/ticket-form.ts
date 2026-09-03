import { DEPARTURE_OPTIONS } from "@/lib/units";

export type TicketDestination = "TI" | "MOTORISTAS";

export const IT_CATEGORIES = [
  "Equipamentos",
  "Aplicativos",
  "Planilhas e Documentos",
  "Internet e Rede",
  "Sites e Sistemas Internos",
  "Acessos e Segurança",
  "Solicitação de Novos Recursos",
  "Desenvolvimento",
  "On-Boarding",
  "Off-Boarding",
] as const;

export type ItCategoryOption = (typeof IT_CATEGORIES)[number];

/**
 * Rótulo da opção "sem motorista definido". O valor gravado é a string vazia:
 * o chamado nasce PENDENTE e é assumido no quadro de Motoristas.
 *
 * A lista de motoristas em si NÃO mora aqui — vem do banco, pelos usuários
 * lotados em Logística › Motoristas (ver `listDrivers` em `lib/tickets/actions`).
 */
export const DRIVER_UNASSIGNED_LABEL = "Em aberto";

/** Unidades cadastradas + "Outro" ao final. */
export const DEPARTURE_POINTS = DEPARTURE_OPTIONS;

export const SERVICE_TYPES = [
  "Entrega",
  "Coleta",
  "Transferência",
  "Compra",
  "Outro",
] as const;

export const MAX_TICKET_IMAGES = 5;

export interface ItTicketForm {
  category: ItCategoryOption | null;
  description: string;
  images: readonly File[];
}

export interface DriverTicketForm {
  /** Id do motorista escolhido. Vazio = "Em aberto". */
  driverId: string;
  departurePoint: string;
  /** Preenchidos apenas quando `departurePoint` é "Outro". */
  departureStreet: string;
  departureNumber: string;
  departureDistrict: string;
  serviceType: string;
  street: string;
  number: string;
  district: string;
  description: string;
  contact: string;
}
