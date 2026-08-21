import { cn } from "@/lib/utils";
import { progressColor } from "@/lib/progress-color";

export interface DonutChartProps {
  value: number;
  size?: number;
  thickness?: number;
  caption?: string;
  className?: string;
}

/** Anel de progresso em SVG puro — sem dependência de biblioteca de gráficos. */
export function DonutChart({
  value,
  size = 132,
  thickness = 10,
  caption,
  className,
}: DonutChartProps) {
  const clamped = Math.min(100, Math.max(0, value));
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped / 100);
  const center = size / 2;

  return (
    <div className={cn("flex flex-col items-center", className)}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          role="img"
          aria-label={`Progresso: ${clamped}%`}
        >
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="hsl(var(--bc-surface-3))"
            strokeWidth={thickness}
          />
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={progressColor(clamped)}
            strokeWidth={thickness}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            transform={`rotate(-90 ${center} ${center})`}
            className="transition-[stroke-dashoffset] duration-700 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-2xl font-bold tracking-tight" style={{ color: progressColor(clamped) }}>{clamped}%</span>
        </div>
      </div>
      {caption && <p className="mt-3 text-xs text-muted">{caption}</p>}
    </div>
  );
}
