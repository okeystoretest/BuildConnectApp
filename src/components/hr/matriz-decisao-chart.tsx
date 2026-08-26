"use client";

import { useId } from "react";
import { Badge } from "@/components/ui/badge";
import {
  MATRIZ_AXIS_X,
  MATRIZ_AXIS_Y,
  MATRIZ_BANDS,
  MATRIZ_MID,
  MATRIZ_ZONES,
  fmtScore,
} from "@/lib/matriz-decisao";
import type { MatrizDecisaoResult, MatrizPoint } from "@/types/evaluation";

/**
 * Gráfico da Matriz de Decisão.
 *
 * Plano cartesiano 0–10: X = média das competências técnicas, Y = média das
 * competências emocionais. O corte no 5 forma os quatro quadrantes; o canto
 * superior direito tem as três faixas escalonadas (7 → Reconhecimento,
 * 8 → Investimento, 9 → Promoção).
 *
 * São plotados: um ponto por avaliador (anônimo), a autoavaliação com forma
 * própria e o PONTO DE DECISÃO — a média de todas as submissões — em destaque,
 * único a receber rótulo numérico. Identidade nunca depende só da cor: cada
 * série tem forma diferente e legenda.
 *
 * Todas as cores saem dos tokens do tema (`--bc-*`), então o gráfico acompanha
 * claro/escuro sem tratamento extra.
 */
export function MatrizDecisaoChart({ data }: { data: MatrizDecisaoResult }) {
  const uid = useId();
  const max = data.scaleMax;

  // Geometria do SVG. Área de plotagem quadrada + margens para eixos.
  const PAD_L = 46;
  const PAD_B = 46;
  const PAD_T = 14;
  const PAD_R = 14;
  const PLOT = 400;
  const W = PAD_L + PLOT + PAD_R;
  const H = PAD_T + PLOT + PAD_B;

  const px = (value: number) => PAD_L + (value / max) * PLOT;
  const py = (value: number) => PAD_T + PLOT - (value / max) * PLOT;

  const ticks = Array.from({ length: max + 1 }, (_, i) => i);
  const zone = data.zone ? MATRIZ_ZONES[data.zone] : null;

  // Cor do ponto de decisão: a da zona; sem zona, o verde do tema.
  const decisionColor = zone ? `hsl(var(--bc-${zone.token}))` : "hsl(var(--bc-primary))";

  return (
    <div className="space-y-4">
      {/* Resultado + médias */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <Score label="Média técnica" value={data.overall?.x ?? null} axis="X" />
          <Score label="Média emocional" value={data.overall?.y ?? null} axis="Y" />
        </div>
        <div className="text-right">
          {zone ? (
            <>
              <Badge tone={zone.token}>
                Resultado: {zone.label}
              </Badge>
              <p className="mt-1 text-[11px] text-muted">{zone.hint}</p>
            </>
          ) : data.overall ? (
            <p className="text-[11px] text-muted">
              Acima do corte nos dois eixos — sem ação sugerida abaixo de 7,0.
            </p>
          ) : null}
        </div>
      </div>

      {data.partial && (
        <p className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
          Posição parcial: {data.received} de {data.expected} avaliadores enviaram. O ponto de
          decisão se move até a sequência fechar.
        </p>
      )}

      <div className="rounded-xl border border-border bg-surface p-3 sm:p-4">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="mx-auto block h-auto w-full max-w-[560px]"
          role="img"
          aria-label={`Matriz de Decisão. Média técnica ${
            data.overall ? fmtScore(data.overall.x) : "indisponível"
          }, média emocional ${data.overall ? fmtScore(data.overall.y) : "indisponível"}.`}
        >
          <defs>
            <clipPath id={`${uid}-plot`}>
              <rect x={PAD_L} y={PAD_T} width={PLOT} height={PLOT} />
            </clipPath>
          </defs>

          {/* Quadrantes */}
          <g clipPath={`url(#${uid}-plot)`}>
            <rect
              x={px(0)}
              y={py(MATRIZ_MID)}
              width={px(MATRIZ_MID) - px(0)}
              height={py(0) - py(MATRIZ_MID)}
              fill="hsl(var(--bc-danger) / 0.10)"
            />
            <rect
              x={px(0)}
              y={py(max)}
              width={px(MATRIZ_MID) - px(0)}
              height={py(MATRIZ_MID) - py(max)}
              fill="hsl(var(--bc-warning) / 0.10)"
            />
            <rect
              x={px(MATRIZ_MID)}
              y={py(MATRIZ_MID)}
              width={px(max) - px(MATRIZ_MID)}
              height={py(0) - py(MATRIZ_MID)}
              fill="hsl(var(--bc-info) / 0.10)"
            />
            <rect
              x={px(MATRIZ_MID)}
              y={py(max)}
              width={px(max) - px(MATRIZ_MID)}
              height={py(MATRIZ_MID) - py(max)}
              fill="hsl(var(--bc-primary) / 0.06)"
            />

            {/* Faixas escalonadas do canto superior direito */}
            {MATRIZ_BANDS.slice()
              .reverse()
              .map((band) => (
                <rect
                  key={band.zone}
                  x={px(band.min)}
                  y={py(max)}
                  width={px(max) - px(band.min)}
                  height={py(band.min) - py(max)}
                  fill={
                    band.zone === "PROMOCAO"
                      ? "hsl(var(--bc-accent) / 0.20)"
                      : "hsl(var(--bc-primary) / 0.12)"
                  }
                  stroke="hsl(var(--bc-border-strong))"
                  strokeWidth={1}
                />
              ))}
          </g>

          {/* Grade */}
          {ticks.map((t) => (
            <g key={`grid-${t}`}>
              <line
                x1={px(t)}
                y1={PAD_T}
                x2={px(t)}
                y2={PAD_T + PLOT}
                stroke="hsl(var(--bc-border))"
                strokeWidth={t === MATRIZ_MID ? 0 : 1}
                opacity={0.7}
              />
              <line
                x1={PAD_L}
                y1={py(t)}
                x2={PAD_L + PLOT}
                y2={py(t)}
                stroke="hsl(var(--bc-border))"
                strokeWidth={t === MATRIZ_MID ? 0 : 1}
                opacity={0.7}
              />
            </g>
          ))}

          {/* Eixos de corte (5) */}
          <line
            x1={px(MATRIZ_MID)}
            y1={PAD_T}
            x2={px(MATRIZ_MID)}
            y2={PAD_T + PLOT}
            stroke="hsl(var(--bc-foreground))"
            strokeWidth={2}
          />
          <line
            x1={PAD_L}
            y1={py(MATRIZ_MID)}
            x2={PAD_L + PLOT}
            y2={py(MATRIZ_MID)}
            stroke="hsl(var(--bc-foreground))"
            strokeWidth={2}
          />

          {/* Moldura */}
          <rect
            x={PAD_L}
            y={PAD_T}
            width={PLOT}
            height={PLOT}
            fill="none"
            stroke="hsl(var(--bc-border-strong))"
            strokeWidth={1}
          />

          {/* Rótulos dos quadrantes */}
          <ZoneLabel x={px(2.5)} y={py(7.2)} text="TREINAMENTO TÉCNICO" />
          <ZoneLabel x={px(2.5)} y={py(2.4)} text="DEMISSÃO" />
          <ZoneLabel x={px(7.5)} y={py(2.4)} text="TREINAMENTO EMOCIONAL" />

          {/* Rótulos das faixas: na vertical, rentes à borda de entrada de cada
              faixa. Na diagonal eles se sobrepõem — as faixas são estreitas. */}
          {MATRIZ_BANDS.slice()
            .reverse()
            .map((band) => (
              <BandLabel
                key={`label-${band.zone}`}
                x={px(band.min) + 11}
                y={py((band.min + max) / 2)}
                text={MATRIZ_ZONES[band.zone].label.toUpperCase()}
              />
            ))}

          {/* Marcações dos eixos */}
          {ticks.map((t) => (
            <g key={`tick-${t}`}>
              <text
                x={px(t)}
                y={PAD_T + PLOT + 16}
                textAnchor="middle"
                className="fill-muted"
                style={{ fontSize: 10 }}
              >
                {t}
              </text>
              <text
                x={PAD_L - 8}
                y={py(t) + 3.5}
                textAnchor="end"
                className="fill-muted"
                style={{ fontSize: 10 }}
              >
                {t}
              </text>
            </g>
          ))}

          {/* Títulos dos eixos */}
          <text
            x={PAD_L + PLOT / 2}
            y={H - 8}
            textAnchor="middle"
            className="fill-foreground"
            style={{ fontSize: 11, fontWeight: 600 }}
          >
            {MATRIZ_AXIS_X}
          </text>
          <text
            x={14}
            y={PAD_T + PLOT / 2}
            textAnchor="middle"
            transform={`rotate(-90 14 ${PAD_T + PLOT / 2})`}
            className="fill-foreground"
            style={{ fontSize: 11, fontWeight: 600 }}
          >
            {MATRIZ_AXIS_Y}
          </text>

          {/* Pontos individuais (anônimos) */}
          <g clipPath={`url(#${uid}-plot)`}>
            {data.points.map((point) => (
              <PointMark key={point.id} point={point} cx={px(point.x)} cy={py(point.y)} />
            ))}

            {/* Ponto de decisão — média de todas as submissões */}
            {data.overall && (
              <g>
                <circle
                  cx={px(data.overall.x)}
                  cy={py(data.overall.y)}
                  r={16}
                  fill={decisionColor}
                  opacity={0.18}
                />
                <circle
                  cx={px(data.overall.x)}
                  cy={py(data.overall.y)}
                  r={8}
                  fill={decisionColor}
                  stroke="hsl(var(--bc-surface))"
                  strokeWidth={2}
                >
                  <title>
                    {`Média geral — técnica ${fmtScore(data.overall.x)} · emocional ${fmtScore(
                      data.overall.y,
                    )}`}
                  </title>
                </circle>
              </g>
            )}
          </g>

          {/* Rótulo numérico só do ponto de decisão, em chip com fundo: ele
              cruza faixas e grade, e o halo de contorno sozinho não basta. */}
          {data.overall && (
            <DecisionChip
              cx={px(data.overall.x)}
              cy={py(data.overall.y)}
              text={`${fmtScore(data.overall.x)} · ${fmtScore(data.overall.y)}`}
              preferLeft={data.overall.x > max * 0.86}
              preferBelow={data.overall.y > max * 0.92}
              bounds={{ x: PAD_L, y: PAD_T, w: PLOT, h: PLOT }}
            />
          )}
        </svg>
      </div>

      {/* Legenda: identidade por forma + cor, nunca só cor */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted">
        <span className="inline-flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
            <circle
              cx="7"
              cy="7"
              r="4.5"
              fill="hsl(var(--bc-muted) / 0.35)"
              stroke="hsl(var(--bc-muted))"
              strokeWidth="1.5"
            />
          </svg>
          Avaliador (anônimo)
        </span>
        <span className="inline-flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
            <rect
              x="7"
              y="1.5"
              width="7.8"
              height="7.8"
              transform="rotate(45 7 1.5)"
              fill="hsl(var(--bc-accent) / 0.35)"
              stroke="hsl(var(--bc-accent))"
              strokeWidth="1.5"
            />
          </svg>
          Autoavaliação
        </span>
        <span className="inline-flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
            <circle cx="7" cy="7" r="5" fill={decisionColor} />
          </svg>
          Média geral (ponto de decisão)
        </span>
      </div>

      <p className="text-[11px] text-muted">
        Cada ponto é a média de um avaliador nos dois blocos. A identidade de quem avaliou não é
        exibida — a ordem dos pontos não corresponde à ordem das posições.
      </p>
    </div>
  );
}

/**
 * Chip com a média geral. Fica ao lado do ponto e é preso à área de plotagem
 * — sem isso ele sai do gráfico quando o ponto encosta na borda.
 */
function DecisionChip({
  cx,
  cy,
  text,
  preferLeft,
  preferBelow,
  bounds,
}: {
  cx: number;
  cy: number;
  text: string;
  preferLeft: boolean;
  preferBelow: boolean;
  bounds: { x: number; y: number; w: number; h: number };
}) {
  const w = text.length * 7 + 14;
  const h = 21;
  const gap = 13;

  const rawX = preferLeft ? cx - gap - w : cx + gap;
  const rawY = preferBelow ? cy + gap : cy - gap - h;

  const x = Math.min(Math.max(rawX, bounds.x + 3), bounds.x + bounds.w - w - 3);
  const y = Math.min(Math.max(rawY, bounds.y + 3), bounds.y + bounds.h - h - 3);

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={5}
        fill="hsl(var(--bc-surface))"
        stroke="hsl(var(--bc-border-strong))"
        strokeWidth={1}
      />
      <text
        x={x + w / 2}
        y={y + h / 2 + 4}
        textAnchor="middle"
        className="fill-foreground"
        style={{ fontSize: 12, fontWeight: 700 }}
      >
        {text}
      </text>
    </g>
  );
}

function PointMark({ point, cx, cy }: { point: MatrizPoint; cx: number; cy: number }) {
  const title = `${point.label} — técnica ${fmtScore(point.x)} · emocional ${fmtScore(point.y)}`;

  if (point.kind === "AUTO") {
    const s = 6.5;
    return (
      <rect
        x={cx - s}
        y={cy - s}
        width={s * 2}
        height={s * 2}
        transform={`rotate(45 ${cx} ${cy})`}
        fill="hsl(var(--bc-accent) / 0.35)"
        stroke="hsl(var(--bc-accent))"
        strokeWidth={2}
      >
        <title>{title}</title>
      </rect>
    );
  }

  return (
    <circle
      cx={cx}
      cy={cy}
      r={5.5}
      fill="hsl(var(--bc-muted) / 0.30)"
      stroke="hsl(var(--bc-muted))"
      strokeWidth={2}
    >
      <title>{title}</title>
    </circle>
  );
}

function ZoneLabel({ x, y, text }: { x: number; y: number; text: string }) {
  return (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      className="fill-muted"
      stroke="hsl(var(--bc-surface))"
      strokeWidth={3}
      paintOrder="stroke"
      style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.04em" }}
    >
      {text}
    </text>
  );
}

function BandLabel({ x, y, text }: { x: number; y: number; text: string }) {
  return (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      transform={`rotate(-90 ${x} ${y})`}
      className="fill-muted"
      style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: "0.04em" }}
    >
      {text}
    </text>
  );
}

function Score({ label, value, axis }: { label: string; value: number | null; axis: "X" | "Y" }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
        {label} <span className="font-mono opacity-70">({axis})</span>
      </p>
      <p className="font-mono text-2xl font-bold text-foreground">
        {value !== null ? fmtScore(value) : "—"}
      </p>
    </div>
  );
}
