import { cn } from "@/lib/utils";
import { progressColor } from "@/lib/progress-color";

export interface ProgressProps {
  value: number;
  /**
   * `scale` (padrão) aplica a escala global por faixa percentual.
   * `primary`/`info` forçam a cor do tema — usado onde a barra
   * identifica uma série (ex.: vídeos vs. documentos).
   */
  tone?: "scale" | "primary" | "info";
  className?: string;
  label?: string;
}

const FIXED_TONE = {
  primary: "hsl(var(--bc-primary))",
  info: "hsl(var(--bc-info))",
} as const;

export function Progress({ value, tone = "scale", className, label }: ProgressProps) {
  const clamped = Math.min(100, Math.max(0, value));
  const color = tone === "scale" ? progressColor(clamped) : FIXED_TONE[tone];

  return (
    <div
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-surface-3", className)}
    >
      <div
        className="h-full rounded-full transition-[width,background-color] duration-500 ease-out"
        style={{ width: `${clamped}%`, backgroundColor: color }}
      />
    </div>
  );
}
