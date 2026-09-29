import { formatarVolume } from "@/lib/sales-funnel/format";
import type { ChannelVolume, StageVolume } from "@/lib/sales-funnel/types";

/**
 * Tons do funil, do topo (frio) ao fundo (quente). Fixos em hex, e não em
 * variável de CSS, porque o projeto marca o tema claro com a classe `light`
 * no <html>: cor de série precisa valer nos dois temas sem depender de qual
 * está ativo.
 */
const TONS = ["#3b82f6", "#6366f1", "#8b5cf6", "#d946ef", "#f43f5e", "#ef4444"];

const LARGURA = 560;
const ALTURA_FAIXA = 66;
/** Espaço do topo para a linha de canais, como na folha. */
const TOPO_CANAIS = 64;
/** Espaço do rodapé para o círculo de negócios convertidos. */
const RODAPE = 92;
/** Piso da largura: nenhuma faixa some, mesmo com taxa muito baixa. */
const MINIMO = 0.14;

/**
 * O funil do canvas, inteiro: os canais alimentando a boca, as etapas
 * afunilando e os negócios convertidos no fundo.
 *
 * A largura de cada faixa é proporcional ao volume da etapa, então o
 * estrangulamento se enxerga sem ler número. A escala é relativa ao TOPO, e
 * não ao maior valor da lista: num funil válido o topo é sempre o maior, e
 * ancorar nele mantém dois funis comparáveis lado a lado.
 *
 * Os canais entram aqui, e não numa lista à parte, porque é a única coisa
 * que a folha desenha ACIMA da boca — e é o que responde "de onde vem esse
 * mil?".
 */
export function FunnelShape({
  stages,
  channels = [],
  conversoes,
}: {
  stages: readonly StageVolume[];
  channels?: readonly ChannelVolume[];
  /** Negócios convertidos: o círculo do fundo. */
  conversoes: number;
}) {
  const topo = stages[0]?.volume ?? 0;
  if (stages.length === 0 || topo <= 0) return null;

  const alturaFunil = stages.length * ALTURA_FAIXA;
  const altura = TOPO_CANAIS + alturaFunil + RODAPE;

  // Até 6 círculos: acima disso a linha vira uma fileira ilegível, e o
  // número de cada canal já está na lista ao lado.
  const visiveis = channels.slice(0, 6);
  const passo = visiveis.length > 0 ? LARGURA / (visiveis.length + 1) : 0;

  return (
    <svg
      viewBox={`0 0 ${LARGURA} ${altura}`}
      className="h-auto w-full"
      role="img"
      aria-label={`Funil de ${stages.length} etapas: ${formatarVolume(
        topo,
      )} no topo, ${formatarVolume(conversoes)} negócios convertidos no fundo`}
    >
      {/* Canais: círculos ligados por uma linha, alimentando a boca do funil. */}
      {visiveis.length > 0 && (
        <g>
          <line
            x1={passo}
            y1={TOPO_CANAIS - 20}
            x2={passo * visiveis.length}
            y2={TOPO_CANAIS - 20}
            stroke="currentColor"
            className="text-border"
            strokeWidth={2}
          />
          {visiveis.map((canal, i) => {
            const cx = passo * (i + 1);
            return (
              <g key={canal.id}>
                <line
                  x1={cx}
                  y1={TOPO_CANAIS - 20}
                  x2={cx}
                  y2={TOPO_CANAIS}
                  stroke="currentColor"
                  className="text-border"
                  strokeWidth={2}
                />
                <circle
                  cx={cx}
                  cy={TOPO_CANAIS - 20}
                  r={17}
                  fill="currentColor"
                  className="text-surface-2"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  strokeDasharray="3 2"
                />
                <text
                  x={cx}
                  y={TOPO_CANAIS - 16}
                  textAnchor="middle"
                  fill="currentColor"
                  className="fill-muted text-[10px] font-semibold"
                >
                  {formatarVolume(canal.volume)}
                </text>
                <text
                  x={cx}
                  y={TOPO_CANAIS - 34}
                  textAnchor="middle"
                  fill="currentColor"
                  className="fill-muted text-[9px] uppercase tracking-wider"
                >
                  {canal.label.slice(0, 11)}
                </text>
              </g>
            );
          })}
        </g>
      )}

      {/* As etapas. */}
      {stages.map((stage, i) => {
        const fracao = Math.max(stage.volume / topo, MINIMO);
        const seguinte = stages[i + 1];
        const fracaoBaixo = seguinte ? Math.max(seguinte.volume / topo, MINIMO) : MINIMO * 1.6;
        const y = TOPO_CANAIS + i * ALTURA_FAIXA;
        const x1 = (LARGURA * (1 - fracao)) / 2;
        const x2 = LARGURA - x1;
        const x4 = (LARGURA * (1 - fracaoBaixo)) / 2;
        const x3 = LARGURA - x4;
        return (
          <g key={stage.id}>
            <polygon
              points={`${x1},${y} ${x2},${y} ${x3},${y + ALTURA_FAIXA} ${x4},${y + ALTURA_FAIXA}`}
              fill={TONS[i % TONS.length]}
              fillOpacity={0.88}
            />
            <text
              x={LARGURA / 2}
              y={y + ALTURA_FAIXA / 2 - 2}
              textAnchor="middle"
              fill="#ffffff"
              className="text-[17px] font-bold"
            >
              {formatarVolume(stage.volume)}
            </text>
            <text
              x={LARGURA / 2}
              y={y + ALTURA_FAIXA / 2 + 14}
              textAnchor="middle"
              fill="#ffffff"
              fillOpacity={0.85}
              className="text-[10px] uppercase tracking-wider"
            >
              {stage.label}
            </text>
          </g>
        );
      })}

      {/* Negócios convertidos: o círculo do fundo da folha. */}
      <g>
        <line
          x1={LARGURA / 2}
          y1={TOPO_CANAIS + alturaFunil}
          x2={LARGURA / 2}
          y2={TOPO_CANAIS + alturaFunil + 16}
          stroke="currentColor"
          className="text-border"
          strokeWidth={2}
        />
        <circle
          cx={LARGURA / 2}
          cy={TOPO_CANAIS + alturaFunil + 46}
          r={30}
          fill="currentColor"
          className="text-surface-1"
          stroke="currentColor"
          strokeWidth={2.5}
        />
        <text
          x={LARGURA / 2}
          y={TOPO_CANAIS + alturaFunil + 52}
          textAnchor="middle"
          fill="currentColor"
          className="fill-foreground text-[18px] font-bold"
        >
          {formatarVolume(conversoes)}
        </text>
        <text
          x={LARGURA / 2}
          y={TOPO_CANAIS + alturaFunil + 88}
          textAnchor="middle"
          fill="currentColor"
          className="fill-muted text-[10px] font-semibold uppercase tracking-[0.15em]"
        >
          Negócios convertidos
        </text>
      </g>
    </svg>
  );
}
