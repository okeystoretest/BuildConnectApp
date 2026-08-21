/**
 * Escala global de cores do progresso.
 * Faixas definidas pelo cliente — hex fixos, fora dos tokens de tema.
 */
const SCALE = [
  { max: 25, color: "#e74c8b" }, // 1–25 rosa/magenta
  { max: 50, color: "#9b59b6" }, // 26–50 roxo
  { max: 75, color: "#f39c12" }, // 51–75 laranja
  { max: 99, color: "#3498db" }, // 76–99 azul
  { max: 100, color: "#27ae60" }, // 100 verde
] as const;

/**
 * Cor da barra para um percentual.
 * O verde é reservado à conclusão: 99,5% ainda é azul.
 */
export function progressColor(value: number): string {
  const clamped = Math.min(100, Math.max(0, value));
  if (clamped >= 100) return "#27ae60";
  for (const step of SCALE) {
    if (clamped < step.max || clamped === step.max) {
      if (step.max === 100) continue;
      return step.color;
    }
  }
  return "#3498db";
}

export const PROGRESS_LEGEND = [
  { range: "1–25%", color: "#e74c8b" },
  { range: "26–50%", color: "#9b59b6" },
  { range: "51–75%", color: "#f39c12" },
  { range: "76–99%", color: "#3498db" },
  { range: "100%", color: "#27ae60" },
] as const;
