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

export const DRIVER_OPTIONS = [
  "Em aberto",
  "João Motta",
  "Pedro Dias",
  "Gustavo Rocha",
] as const;

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
  driver: string;
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
