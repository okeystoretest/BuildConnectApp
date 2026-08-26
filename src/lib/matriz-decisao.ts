/**
 * Matriz de Decisão — regras do gráfico.
 *
 * O instrumento tem DOIS blocos e a ordem das seções é o contrato:
 *   seção 0 = Critérios Técnicos   → eixo X (Habilidade/Conhecimento)
 *   seção 1 = Critérios Emocionais → eixo Y (Atitude/Caráter)
 * (ver `evaluation-catalog.ts`). Cada avaliador gera um ponto (média do bloco
 * técnico, média do bloco emocional). O ponto de decisão é a média de TODAS as
 * submissões recebidas — inclusive a autoavaliação, que na Matriz é a última
 * posição da sequência de avaliadores.
 *
 * Zonas (escala 1–10, corte no 5):
 *   x < 5  e  y < 5   → Demissão
 *   x ≥ 5  e  y < 5   → Treinamento Emocional  (bom técnico, atitude baixa)
 *   x < 5  e  y ≥ 5   → Treinamento Técnico
 *   x ≥ 7  e  y ≥ 7   → Reconhecimento
 *   x ≥ 8  e  y ≥ 8   → Investimento
 *   x ≥ 9  e  y ≥ 9   → Promoção
 * A faixa 5–7 nos dois eixos fica deliberadamente SEM rótulo: o colaborador
 * está acima da média e o sistema não sugere ação (decisão do cliente).
 */

export type MatrizZoneId =
  | "DEMISSAO"
  | "TREINAMENTO_TECNICO"
  | "TREINAMENTO_EMOCIONAL"
  | "RECONHECIMENTO"
  | "INVESTIMENTO"
  | "PROMOCAO";

/** Corte central dos quadrantes. */
export const MATRIZ_MID = 5;

/** Escala do instrumento. Mantida junto das zonas para o gráfico não adivinhar. */
export const MATRIZ_SCALE_MAX = 10;

export const MATRIZ_AXIS_X = "Competências Técnicas — Habilidade/Conhecimento";
export const MATRIZ_AXIS_Y = "Competências Emocionais — Atitude/Caráter";

export interface MatrizZoneMeta {
  id: MatrizZoneId;
  label: string;
  /** Descrição curta, exibida junto do resultado. */
  hint: string;
  /** Token de cor do tema (usado como `hsl(var(--bc-…))`). */
  token: "danger" | "warning" | "info" | "primary" | "accent";
}

export const MATRIZ_ZONES: Record<MatrizZoneId, MatrizZoneMeta> = {
  DEMISSAO: {
    id: "DEMISSAO",
    label: "Demissão",
    hint: "Abaixo da média nos dois eixos.",
    token: "danger",
  },
  TREINAMENTO_TECNICO: {
    id: "TREINAMENTO_TECNICO",
    label: "Treinamento Técnico",
    hint: "Atitude acima da média, competência técnica abaixo.",
    token: "warning",
  },
  TREINAMENTO_EMOCIONAL: {
    id: "TREINAMENTO_EMOCIONAL",
    label: "Treinamento Emocional",
    hint: "Competência técnica acima da média, atitude abaixo.",
    token: "info",
  },
  RECONHECIMENTO: {
    id: "RECONHECIMENTO",
    label: "Reconhecimento",
    hint: "A partir de 7,0 nos dois eixos.",
    token: "primary",
  },
  INVESTIMENTO: {
    id: "INVESTIMENTO",
    label: "Investimento",
    hint: "A partir de 8,0 nos dois eixos.",
    token: "primary",
  },
  PROMOCAO: {
    id: "PROMOCAO",
    label: "Promoção",
    hint: "A partir de 9,0 nos dois eixos.",
    token: "accent",
  },
};

/** Faixas escalonadas do canto superior direito, da maior para a menor. */
export const MATRIZ_BANDS: readonly { min: number; zone: MatrizZoneId }[] = [
  { min: 9, zone: "PROMOCAO" },
  { min: 8, zone: "INVESTIMENTO" },
  { min: 7, zone: "RECONHECIMENTO" },
] as const;

/**
 * Zona de um ponto. `null` = quadrante bom, abaixo de 7 nos dois eixos: por
 * definição do cliente, o sistema não escreve rótulo nenhum nesse caso.
 */
export function classifyMatriz(x: number, y: number): MatrizZoneId | null {
  if (x < MATRIZ_MID && y < MATRIZ_MID) return "DEMISSAO";
  if (x < MATRIZ_MID) return "TREINAMENTO_TECNICO";
  if (y < MATRIZ_MID) return "TREINAMENTO_EMOCIONAL";

  for (const band of MATRIZ_BANDS) {
    if (x >= band.min && y >= band.min) return band.zone;
  }
  return null;
}

/** Média com 2 casas; null para lista vazia. */
export function averageOf(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sum = values.reduce((acc, v) => acc + v, 0);
  return Math.round((sum / values.length) * 100) / 100;
}

/** Formatação pt-BR das médias (vírgula decimal, 1 casa). */
export function fmtScore(value: number): string {
  return value.toFixed(1).replace(".", ",");
}
