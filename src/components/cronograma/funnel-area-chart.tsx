"use client";

import { useMemo } from "react";
import { FUNNEL } from "@/lib/funnel";
import type { FunnelStage, FunnelVolumePoint } from "@/types/cronograma";

export interface FunnelAreaChartProps {
  points: readonly FunnelVolumePoint[];
  /** Etapas visíveis — acompanha os filtros do painel. */
  visible: readonly FunnelStage[];
}

const WIDTH = 720;
const HEIGHT = 280;
const PAD = { top: 16, right: 16, bottom: 30, left: 40 };

/** Escala "bonita" para o eixo Y: sempre múltiplo de 4 acima do pico. */
function niceMax(value: number): number {
  if (value <= 4) return 4;
  const step = Math.ceil(value / 4);
  const rounded = step <= 5 ? step : Math.ceil(step / 5) * 5;
  return rounded * 4;
}

/**
 * Área empilhada em SVG puro — sem biblioteca de gráficos, no mesmo espírito
 * do donut de progresso já existente. BOFU na base, MOFU no meio e TOFU no
 * topo: lido de baixo para cima, é o funil na ordem em que o público desce.
 */
export function FunnelAreaChart({ points, visible }: FunnelAreaChartProps) {
  const stacked = useMemo(() => {
    // Ordem de empilhamento (base → topo).
    const order: FunnelStage[] = ["BOFU", "MOFU", "TOFU"];
    const active = order.filter((stage) => visible.includes(stage));

    // Linha acumulada de cada etapa ativa.
    const cumulative = points.map((point) => {
      let running = 0;
      const values: Partial<Record<FunnelStage, number>> = {};
      for (const stage of active) {
        running += point[stage];
        values[stage] = running;
      }
      return { total: running, values };
    });

    const peak = cumulative.reduce((max, row) => Math.max(max, row.total), 0);
    return { active, cumulative, max: niceMax(peak) };
  }, [points, visible]);

  const innerW = WIDTH - PAD.left - PAD.right;
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const count = points.length;

  const x = (index: number) =>
    count <= 1 ? PAD.left + innerW / 2 : PAD.left + (index * innerW) / (count - 1);
  const y = (value: number) => PAD.top + innerH * (1 - value / stacked.max);

  const ticks = [0, stacked.max / 4, stacked.max / 2, (stacked.max * 3) / 4, stacked.max];

  /** Polígono entre a linha da etapa e a linha imediatamente abaixo. */
  function areaPath(stage: FunnelStage, index: number): string {
    const upper = stacked.cumulative.map(
      (row, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(row.values[stage] ?? 0)}`,
    );
    const below = stacked.active[index - 1];
    const lower = [...stacked.cumulative]
      .reverse()
      .map((row, i) => {
        const realIndex = count - 1 - i;
        const value = below ? (row.values[below] ?? 0) : 0;
        return `L ${x(realIndex)} ${y(value)}`;
      });
    return [...upper, ...lower, "Z"].join(" ");
  }

  function linePath(stage: FunnelStage): string {
    return stacked.cumulative
      .map((row, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(row.values[stage] ?? 0)}`)
      .join(" ");
  }

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="h-auto w-full"
      role="img"
      aria-label="Volume de posts por etapa do funil, por dia da semana"
    >
      {/* Grade horizontal */}
      {ticks.map((tick) => (
        <g key={tick}>
          <line
            x1={PAD.left}
            x2={WIDTH - PAD.right}
            y1={y(tick)}
            y2={y(tick)}
            stroke="hsl(var(--bc-border))"
            strokeWidth={1}
          />
          <text
            x={PAD.left - 8}
            y={y(tick) + 4}
            textAnchor="end"
            className="fill-[hsl(var(--bc-muted))] text-[11px]"
          >
            {Math.round(tick)}
          </text>
        </g>
      ))}

      {/* Áreas, da base para o topo */}
      {stacked.active.map((stage, index) => (
        <path key={`area-${stage}`} d={areaPath(stage, index)} fill={FUNNEL[stage].color} opacity={0.45} />
      ))}

      {/* Linhas de contorno */}
      {stacked.active.map((stage) => (
        <path
          key={`line-${stage}`}
          d={linePath(stage)}
          fill="none"
          stroke={FUNNEL[stage].color}
          strokeWidth={2}
          strokeLinejoin="round"
        />
      ))}

      {/* Rótulos do eixo X + área de tooltip nativo por dia */}
      {points.map((point, index) => (
        <g key={point.label}>
          <text
            x={x(index)}
            y={HEIGHT - 10}
            textAnchor="middle"
            className="fill-[hsl(var(--bc-muted))] text-[11px]"
          >
            {point.label}
          </text>
          <rect
            x={x(index) - innerW / (count * 2)}
            y={PAD.top}
            width={innerW / count}
            height={innerH}
            fill="transparent"
          >
            <title>
              {`${point.label} · TOFU ${point.TOFU} · MOFU ${point.MOFU} · BOFU ${point.BOFU}`}
            </title>
          </rect>
        </g>
      ))}
    </svg>
  );
}
