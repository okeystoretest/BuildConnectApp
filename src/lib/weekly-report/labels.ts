/**
 * Rótulos e formatação do Relatório Semanal.
 *
 * Sem "use server" e sem acesso ao banco: é importado por componentes de
 * cliente. A legenda 🟢/🟡/🔴 da planilha vive aqui, num lugar só — era texto
 * dentro da própria célula do Excel, e repeti-la em cada tela traria de volta
 * o problema que a lista suspensa resolvia.
 */

import type {
  MarketingTaskCategory,
  MarketingTaskPriority,
  MarketingTaskStatus,
  WeeklyHealth,
  WeeklyReportStatus,
} from "@/types/weekly-report";

export const HEALTH_LABEL: Record<WeeklyHealth, string> = {
  NO_RITMO: "🟢 No ritmo",
  ATENCAO: "🟡 Atenção",
  TRAVADO: "🔴 Travado",
};

export const HEALTH_ORDER: readonly WeeklyHealth[] = ["NO_RITMO", "ATENCAO", "TRAVADO"];

/** Tom do Badge por saúde. */
export const HEALTH_TONE: Record<WeeklyHealth, "primary" | "warning" | "danger"> = {
  NO_RITMO: "primary",
  ATENCAO: "warning",
  TRAVADO: "danger",
};

export const REPORT_STATUS_LABEL: Record<WeeklyReportStatus, string> = {
  RASCUNHO: "Rascunho",
  ENVIADO: "Enviado",
  APROVADO: "Aprovado",
};

export const REPORT_STATUS_TONE: Record<WeeklyReportStatus, "neutral" | "info" | "primary"> = {
  RASCUNHO: "neutral",
  ENVIADO: "info",
  APROVADO: "primary",
};

export const TASK_STATUS_LABEL: Record<MarketingTaskStatus, string> = {
  BACKLOG: "Backlog",
  A_FAZER: "A fazer",
  EM_ANDAMENTO: "Em andamento",
  REVISAO: "Revisão",
  PUBLICADO: "Publicado",
};

export const TASK_CATEGORY_LABEL: Record<MarketingTaskCategory, string> = {
  CONTEUDO: "Conteúdo",
  PUBLICACAO: "Publicação",
  COMUNIDADE: "Comunidade",
  RELATORIO: "Relatório",
  PROCESSO: "Processo",
};

export const TASK_PRIORITY_LABEL: Record<MarketingTaskPriority, string> = {
  ALTA: "Alta",
  MEDIA: "Média",
  BAIXA: "Baixa",
};

export const TASK_PRIORITY_TONE: Record<MarketingTaskPriority, "danger" | "warning" | "neutral"> = {
  ALTA: "danger",
  MEDIA: "warning",
  BAIXA: "neutral",
};

/** "2026-11-17" → "17/11". O ano fica no cabeçalho, não em cada data. */
export function formatarDiaMes(iso?: string): string {
  if (!iso) return "—";
  const [, mes, dia] = iso.split("-");
  if (!mes || !dia) return "—";
  return `${dia}/${mes}`;
}

/** "2026-11-17" → "17/11/2026". */
export function formatarData(iso?: string): string {
  if (!iso) return "—";
  const [ano, mes, dia] = iso.split("-");
  if (!ano || !mes || !dia) return "—";
  return `${dia}/${mes}/${ano}`;
}

/** ISO completo → "17/11/2026 às 17:42", no fuso de quem está lendo. */
export function formatarDataHora(iso?: string): string {
  if (!iso) return "—";
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return "—";
  return `${data.toLocaleDateString("pt-BR")} às ${data.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

/**
 * Fração → percentual com sinal ("+20,0%", "-25,0%").
 *
 * O sinal é obrigatório na variação: "20%" e "+20%" se leem igual, mas uma
 * queda de 20% escrita sem o sinal passa por alta na leitura rápida de sexta.
 */
export function formatarVariacao(fracao?: number): string {
  if (fracao === undefined) return "—";
  const sinal = fracao > 0 ? "+" : "";
  return `${sinal}${(fracao * 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

/** Fração → percentual sem sinal ("90,0%"). */
export function formatarPercentual(fracao?: number): string {
  if (fracao === undefined) return "—";
  return `${(fracao * 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

/** Número da tela: até duas casas, separador brasileiro. "—" quando ausente. */
export function formatarNumero(valor?: number): string {
  if (valor === undefined) return "—";
  return valor.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}
