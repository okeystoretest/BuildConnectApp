import type { SectorGroup, SectorLink } from "@/types";

export const GENERAL_LINKS: readonly SectorLink[] = [
  { label: "Meu Progresso", href: "/progresso", icon: "BarChart3" },
  { label: "Minhas Avaliações", href: "/minhas-avaliacoes", icon: "ClipboardCheck" },
  { label: "Meus Chamados", href: "/chamados", icon: "Ticket" },
];

export const SECTOR_GROUPS: readonly SectorGroup[] = [
  {
    label: "Comercial",
    icon: "Store",
    items: [
      { label: "OKEY - Vitrine", href: "/setores/okey-vitrine", icon: "Cherry" },
      { label: "Lov Club - Vitrine", href: "/setores/lov-club-vitrine", icon: "Heart" },
      { label: "Vendas", href: "/setores/vendas", icon: "Tag" },
      { label: "Marketing", href: "/setores/marketing", icon: "Megaphone" },
    ],
  },
  {
    label: "Produção",
    icon: "Settings",
    items: [
      { label: "Criação", href: "/setores/criacao", icon: "PenLine" },
      { label: "PCP", href: "/setores/pcp", icon: "ClipboardList" },
      { label: "Almoxarifado", href: "/setores/almoxarifado", icon: "Package" },
      { label: "Corte", href: "/setores/corte", icon: "Scissors" },
      { label: "Acabamento", href: "/setores/acabamento", icon: "Wand2" },
      { label: "Revisão", href: "/setores/revisao", icon: "CircleCheck" },
      { label: "Externo", href: "/setores/externo", icon: "ExternalLink" },
    ],
  },
  {
    label: "Logística",
    icon: "Truck",
    items: [
      { label: "Estoque", href: "/setores/estoque", icon: "Package" },
      { label: "Motoristas", href: "/setores/motoristas", icon: "CarFront" },
    ],
  },
  {
    label: "Administrativo",
    icon: "Landmark",
    items: [
      { label: "Compras", href: "/setores/compras", icon: "ShoppingCart" },
      { label: "Financeiro", href: "/setores/financeiro", icon: "Wallet" },
    ],
  },
];

/**
 * Setores transversais, sem subsetores. Os slugs `ti` e `rh` permanecem —
 * são a chave das rotas dedicadas e do RBAC. Apenas a nomenclatura muda:
 * TI → Retaguarda e RH → DHO.
 */
export const STANDALONE_SECTORS: readonly SectorGroup[] = [
  {
    label: "Retaguarda",
    icon: "MonitorSmartphone",
    items: [{ label: "Retaguarda", href: "/setores/ti", icon: "MonitorSmartphone" }],
    permission: "sector.it",
  },
  {
    label: "DHO",
    icon: "Users",
    items: [{ label: "DHO", href: "/setores/rh", icon: "Users" }],
    permission: "evaluations.view",
  },
];

/**
 * Extrai o slug do subsetor a partir de um href de navegação.
 * "/setores/motoristas" -> "motoristas". Retorna null para links que não
 * apontam para um subsetor (ex.: /progresso, /chamados).
 */
export function slugFromHref(href: string): string | null {
  const match = href.match(/^\/setores\/([^/]+)$/);
  return match?.[1] ?? null;
}
