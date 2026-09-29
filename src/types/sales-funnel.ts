/** Domínio da ferramenta Funil de Vendas, do lado da tela. */

export type SalesFunnelStatus = "RASCUNHO" | "ATIVO" | "ARQUIVADO";

export interface FunnelStageItem {
  id: string;
  order: number;
  label: string;
  rate: number;
  transitionRule?: string;
}

export interface FunnelChannelItem {
  id: string;
  order: number;
  label: string;
  strategy?: string;
  share: number;
}

export interface FunnelScenarioItem {
  id: string;
  name: string;
  notes?: string;
  ticketPercent: number;
  topPercent: number;
  /** stageId → taxa. Só as etapas que o cenário muda. */
  rates: Record<string, number>;
}

/** O card da lista: o suficiente para decidir qual funil abrir. */
export interface SalesFunnelListItem {
  id: string;
  name: string;
  /** ISO da data de referência (o campo DATA do canvas). */
  referenceDate: string;
  goalCents: number;
  ticketCents: number;
  status: SalesFunnelStatus;
  /** Calculado no servidor para o card não depender de JS. */
  requiredConversions: number;
  topVolume: number;
  authorName?: string;
}

export interface SalesFunnelDetail extends SalesFunnelListItem {
  notes?: string;
  stages: readonly FunnelStageItem[];
  channels: readonly FunnelChannelItem[];
  scenarios: readonly FunnelScenarioItem[];
}

export interface SalesFunnelData {
  scopeSlug: string;
  scopeLabel: string;
  /** true quando o subsetor atual lê a base de outro (Marketing lê Vendas). */
  inherited: boolean;
  /** Resolvido no servidor a partir de `funnel.manage`. A UI só reflete. */
  canManage: boolean;
  funnels: readonly SalesFunnelListItem[];
}
