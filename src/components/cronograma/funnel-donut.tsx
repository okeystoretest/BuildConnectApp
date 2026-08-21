"use client";

import { FUNNEL } from "@/lib/funnel";
import type { FunnelBalanceSlice } from "@/types/cronograma";

export interface FunnelDonutProps {
  balance: readonly FunnelBalanceSlice[];
  size?: number;
  thickness?: number;
}

/**
 * Rosca de distribuição do funil em SVG puro. Cada fatia é um arco desenhado
 * com stroke-dasharray, na mesma técnica do donut de progresso do projeto.
 */
export function FunnelDonut({ balance, size = 200, thickness = 34 }: FunnelDonutProps) {
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;
  const total = balance.reduce((sum, slice) => sum + slice.count, 0);

  let offset = 0;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label="Distribuição de conteúdo por etapa do funil"
    >
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke="hsl(var(--bc-surface-3))"
        strokeWidth={thickness}
      />

      {total > 0 &&
        balance.map((slice) => {
          const fraction = slice.count / total;
          const length = circumference * fraction;
          const dash = `${length} ${circumference - length}`;
          const rotation = (offset / circumference) * 360 - 90;
          offset += length;

          if (slice.count === 0) return null;
          return (
            <circle
              key={slice.stage}
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke={FUNNEL[slice.stage].color}
              strokeWidth={thickness}
              strokeDasharray={dash}
              transform={`rotate(${rotation} ${center} ${center})`}
            >
              <title>{`${FUNNEL[slice.stage].label}: ${slice.count} posts (${slice.percent}%)`}</title>
            </circle>
          );
        })}

      {total > 0 && (
        <>
          <text
            x={center}
            y={center - 2}
            textAnchor="middle"
            className="fill-[hsl(var(--bc-foreground))] text-[22px] font-bold"
          >
            {total}
          </text>
          <text
            x={center}
            y={center + 16}
            textAnchor="middle"
            className="fill-[hsl(var(--bc-muted))] text-[11px]"
          >
            posts no mês
          </text>
        </>
      )}
    </svg>
  );
}
