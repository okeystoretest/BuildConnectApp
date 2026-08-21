import type { ContentBrand, ContentFormat, ContentStatus, FunnelStage } from "@/types/cronograma";

/**
 * Vocabulário único do Cronograma: rótulos, cores e ordem das etapas.
 * Gráficos, badges, filtros e legenda derivam daqui — nenhum componente
 * define cor ou texto de funil por conta própria.
 */

export const FUNNEL_ORDER: readonly FunnelStage[] = ["TOFU", "MOFU", "BOFU"];

interface FunnelMeta {
  /** Nome curto usado em badges e legendas de gráfico. */
  short: string;
  /** Rótulo completo (ex.: "TOFU · Atração"). */
  label: string;
  title: string;
  description: string;
  /** Cor sólida da série. Fixa em hex para valer nos dois temas. */
  color: string;
  /**
   * Classe do badge. O tema claro é alcançado por `[.light_&]:` porque o
   * projeto marca o tema claro com a classe `light` no <html>.
   */
  badge: string;
}

export const FUNNEL: Record<FunnelStage, FunnelMeta> = {
  TOFU: {
    short: "TOFU",
    label: "TOFU · Atração",
    title: "TOFU (Topo)",
    description: "Atrair novo público. Reels e trends.",
    color: "#3b82f6",
    badge: "border-[#3b82f6]/35 bg-[#3b82f6]/15 text-[#93c5fd] [.light_&]:text-[#1d4ed8]",
  },
  MOFU: {
    short: "MOFU",
    label: "MOFU · Aquecimento",
    title: "MOFU (Meio)",
    description: "Aquecer e educar. Conteúdo de valor.",
    color: "#f5a524",
    badge: "border-[#f5a524]/35 bg-[#f5a524]/15 text-[#fcd34d] [.light_&]:text-[#b45309]",
  },
  BOFU: {
    short: "BOFU",
    label: "BOFU · Conversão",
    title: "BOFU (Fundo)",
    description: "Converter em venda. Ofertas e CTAs.",
    color: "#ef4444",
    badge: "border-[#ef4444]/35 bg-[#ef4444]/15 text-[#fca5a5] [.light_&]:text-[#b91c1c]",
  },
};

export const BRAND_ORDER: readonly ContentBrand[] = ["OKEY", "LOV_CLUB"];

interface BrandMeta {
  label: string;
  /** Fundo do card no calendário. */
  background: string;
  /** Texto sobre o fundo da marca — fixo em escuro, os dois tons são claros. */
  foreground: string;
  border: string;
}

export const BRAND: Record<ContentBrand, BrandMeta> = {
  OKEY: {
    label: "OKEY",
    background: "#f0e6a8",
    foreground: "#3d3410",
    border: "#d9cc84",
  },
  LOV_CLUB: {
    label: "Lov Club",
    background: "#f8b4c4",
    foreground: "#4a1420",
    border: "#e895a8",
  },
};

/**
 * Normaliza o valor de marca vindo do banco/props para a chave de `BRAND`.
 * Aceita variações de escrita ("lov club", "LOV-CLUB", "lovclub") porque a
 * cor do card não pode depender do formato exato da string.
 */
export function resolveBrand(value: unknown): ContentBrand | null {
  if (typeof value !== "string") return null;
  const key = value
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
  if (key === "OKEY") return "OKEY";
  if (key === "LOV_CLUB" || key === "LOVCLUB") return "LOV_CLUB";
  return null;
}

export const FORMAT_ORDER: readonly ContentFormat[] = [
  "REEL",
  "STORY",
  "FEED",
  "REEL_FEED",
  "CARROSSEL",
  "LIVE",
];

export const FORMAT_LABEL: Record<ContentFormat, string> = {
  REEL: "Reel",
  STORY: "Story",
  FEED: "Feed",
  REEL_FEED: "Reel + Feed",
  CARROSSEL: "Carrossel",
  LIVE: "Live",
};

export const STATUS_ORDER: readonly ContentStatus[] = [
  "IDEIA",
  "EM_PRODUCAO",
  "AGENDADO",
  "PUBLICADO",
];

export const STATUS_LABEL: Record<ContentStatus, string> = {
  IDEIA: "Ideia",
  EM_PRODUCAO: "Em Produção",
  AGENDADO: "Agendado",
  PUBLICADO: "Publicado",
};

export const STATUS_TONE: Record<ContentStatus, "neutral" | "warning" | "info" | "primary"> = {
  IDEIA: "neutral",
  EM_PRODUCAO: "warning",
  AGENDADO: "info",
  PUBLICADO: "primary",
};

/** Cabeçalho do calendário e do gráfico, sempre iniciando na segunda-feira. */
export const WEEKDAY_LONG: readonly string[] = [
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
  "Domingo",
];

export const WEEKDAY_SHORT: readonly string[] = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

export const MONTH_LABEL: readonly string[] = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

/** Índice 0–6 com a semana começando na segunda (JS usa domingo = 0). */
export function weekdayIndex(date: Date): number {
  return (date.getDay() + 6) % 7;
}
