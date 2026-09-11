import { BRAND } from "@/lib/funnel";

/**
 * Vocabulário da configuração de IA, compartilhado por servidor e cliente.
 * Sem importar prisma de propósito: o painel da Retaguarda (client component)
 * lê daqui os rótulos e os tetos.
 */

export const AI_SCOPES = ["DEFAULT", "OKEY", "LOV_CLUB"] as const;
export type AiScope = (typeof AI_SCOPES)[number];

export const AI_SCOPE_LABEL: Record<AiScope, string> = {
  DEFAULT: "Padrão",
  OKEY: BRAND.OKEY.label,
  LOV_CLUB: BRAND.LOV_CLUB.label,
};

export const AI_SCOPE_HINT: Record<AiScope, string> = {
  DEFAULT:
    "Vale para todo roteiro, de qualquer marca. É o lugar das regras da empresa: o que nunca pode aparecer, idioma, tamanho, estrutura.",
  OKEY: "Acrescentada depois da Padrão quando o card é da OKEY. Tom, vocabulário e assinatura da marca.",
  LOV_CLUB:
    "Acrescentada depois da Padrão quando o card é da Lov Club. Tom, vocabulário e assinatura da marca.",
};

export const DEFAULT_MODEL = "gemini-2.5-flash";

/** Tetos de tamanho, em caracteres. Os mesmos no formulário e na action. */
export const INSTRUCTION_MAX = 8000;
export const SCRIPT_MAX = 12000;
export const MODEL_MAX = 80;
export const API_KEY_MAX = 200;
