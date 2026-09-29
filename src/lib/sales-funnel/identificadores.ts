import type { SalesFunnelStatus } from "@/types/sales-funnel";

/**
 * Guardas dos argumentos POSICIONAIS das Server Actions.
 *
 * O tipo do TypeScript não existe em runtime, e o argumento de uma Server
 * Action é desserializado do cliente. Um `funnelId` enviado como
 * `{ not: "" }` deixa de ser um id e vira um OPERADOR do Prisma: o
 * `deleteMany({ where: { id: { not: "" }, subsectorId } })` que deveria
 * apagar um funil apaga todos os do setor numa chamada só.
 *
 * Quem passa por aqui já tem `funnel.manage` no setor — não há escalada de
 * privilégio. O que há é a diferença entre apagar UM registro e apagar a
 * base inteira do setor por engano ou por má-fé.
 *
 * As actions que recebem os dados num objeto já são validadas por Zod; estas
 * funções existem para as que recebem o id solto.
 */

/** Tamanho folgado para um cuid (25 caracteres), apertado para um `where`. */
const MAX_ID = 64;

export function lerIdentificador(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const limpo = valor.trim();
  if (limpo.length === 0 || limpo.length > MAX_ID) return null;
  return limpo;
}

const STATUS: readonly SalesFunnelStatus[] = ["RASCUNHO", "ATIVO", "ARQUIVADO"];

export function lerStatus(valor: unknown): SalesFunnelStatus | null {
  if (typeof valor !== "string") return null;
  return STATUS.find((s) => s === valor) ?? null;
}
