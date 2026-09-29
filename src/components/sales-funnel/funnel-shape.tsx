import { formatarVolume } from "@/lib/sales-funnel/format";
import type { StageVolume } from "@/lib/sales-funnel/types";

/**
 * Tons do funil, do topo (frio) ao fundo (quente). Fixos em hex, e não em
 * variável de CSS, porque o projeto marca o tema claro com a classe `light`
 * no <html>: cor de série precisa valer nos dois temas sem depender de qual
 * está ativo.
 */
const TONS = ["#3b82f6", "#6366f1", "#8b5cf6", "#d946ef", "#f43f5e", "#ef4444"];

const ALTURA_FAIXA = 56;
const LARGURA = 320;
/** Piso da largura: nenhuma faixa some, mesmo com taxa muito baixa. */
const MINIMO = 0.12;

/**
 * O funil como trapézio empilhado: a LARGURA de cada faixa é proporcional ao
 * volume da etapa, então o estrangulamento se enxerga sem ler número.
 *
 * A escala é relativa ao TOPO, e não ao maior valor da lista: num funil
 * válido o topo é sempre o maior, e ancorar nele mantém dois funis
 * comparáveis lado a lado.
 */
export function FunnelShape({ stages }: { stages: readonly StageVolume[] }) {
  const topo = stages[0]?.volume ?? 0;
  if (stages.length === 0 || topo <= 0) return null;

  const altura = stages.length * ALTURA_FAIXA;

  return (
    <svg
      viewBox={`0 0 ${LARGURA} ${altura}`}
      className="w-full max-w-[320px]"
      role="img"
      aria-label={`Funil de ${stages.length} etapas, de ${formatarVolume(
        topo,
      )} no topo a ${formatarVolume(stages[stages.length - 1]?.volume ?? 0)} na última etapa`}
    >
      {stages.map((stage, i) => {
        const fracao = Math.max(stage.volume / topo, MINIMO);
        const seguinte = stages[i + 1];
        // A última faixa afunila sozinha: ela desemboca no negócio ganho, que
        // não é etapa e por isso não tem volume próprio no desenho.
        const fracaoBaixo = seguinte ? Math.max(seguinte.volume / topo, MINIMO) : fracao * 0.7;
        const y = i * ALTURA_FAIXA;
        const x1 = (LARGURA * (1 - fracao)) / 2;
        const x2 = LARGURA - x1;
        const x4 = (LARGURA * (1 - fracaoBaixo)) / 2;
        const x3 = LARGURA - x4;
        return (
          <g key={stage.id}>
            <polygon
              points={`${x1},${y} ${x2},${y} ${x3},${y + ALTURA_FAIXA} ${x4},${y + ALTURA_FAIXA}`}
              fill={TONS[i % TONS.length]}
              fillOpacity={0.85}
            />
            <text
              x={LARGURA / 2}
              y={y + ALTURA_FAIXA / 2 + 5}
              textAnchor="middle"
              fill="#ffffff"
              className="text-[13px] font-semibold"
            >
              {formatarVolume(stage.volume)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
