import { formatarPercentual, formatarVolume } from "@/lib/sales-funnel/format";
import { FASES, corDaFaixa, gruposDeFase } from "@/lib/sales-funnel/phases";
import type { ChannelVolume, StageVolume } from "@/lib/sales-funnel/types";

/** Corta o nome do canal no desenho; o nome inteiro fica no tooltip. */
function recortar(texto: string): string {
  return texto.length > 12 ? `${texto.slice(0, 11)}…` : texto;
}

/** Largura do corpo do funil, sem as margens dos rótulos. */
const FUNIL = 560;
/**
 * Margem esquerda: a sigla ToFu/MoFu/BoFu e o nome da fase no canvas.
 *
 * Os dois moram do MESMO lado, e na horizontal. A versão anterior punha o
 * nome num trilho vertical à direita, com a altura do grupo de faixas — e
 * com uma etapa por fase esse trilho tem 60px, enquanto "RELACIONAMENTO"
 * deitado mede uns 96px. As três palavras somavam ~300px de texto para 198px
 * de funil: elas transbordavam e se escreviam umas por cima das outras.
 * Nenhum tamanho de fonte legível resolve isso; o que resolve é o texto
 * deixar de depender da altura da faixa.
 */
const MARGEM_ESQ = 112;
/** Margem direita: só respiro. O trilho vertical não existe mais. */
const MARGEM_DIR = 16;
const LARGURA = MARGEM_ESQ + FUNIL + MARGEM_DIR;
/** Eixo do funil: é o centro do CORPO, não o centro do viewBox. */
const EIXO = MARGEM_ESQ + FUNIL / 2;

const ALTURA_FAIXA = 66;
/** Espaço do topo para a linha de canais, como na folha. */
const TOPO_CANAIS = 74;
/** Comprimento do gargalo entre a última faixa e o nó de convertidos. */
const GARGALO = 26;
/** Largura do gargalo: o bico do funil, por onde a venda sai. */
const LARGURA_GARGALO = 30;
/** Espaço do rodapé para o círculo de negócios convertidos. */
const RODAPE = 100;
/** Piso da largura: nenhuma faixa some, mesmo com taxa muito baixa. */
const MINIMO = 0.14;

/**
 * O funil do canvas, inteiro: os canais alimentando a boca, as etapas
 * afunilando por fase, o gargalo e os negócios convertidos no fundo.
 *
 * A largura de cada faixa é proporcional ao volume da etapa, então o
 * estrangulamento se enxerga sem ler número. A escala é relativa ao TOPO, e
 * não ao maior valor da lista: num funil válido o topo é sempre o maior, e
 * ancorar nele mantém dois funis comparáveis lado a lado.
 *
 * A largura também nunca ALARGA descendo. O piso `MINIMO` existe para uma
 * etapa de taxa baixíssima não sumir, mas sozinho ele deixava a faixa de baixo
 * ficar tão larga quanto a de cima quando o volume desabava — e aí a silhueta
 * deixava de ser a de um funil justo no ponto em que o gargalo importa. A
 * fração de cada faixa é presa à da faixa anterior.
 *
 * Os canais entram aqui, e não numa lista à parte, porque é a única coisa que
 * a folha desenha ACIMA da boca — e é o que responde "de onde vem esse mil?".
 *
 * As legendas moram na margem do próprio SVG, e não numa coluna ao lado do
 * desenho: é o que permite alinhar cada rótulo por `y` à faixa que ele nomeia.
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
  const fundoFunil = TOPO_CANAIS + alturaFunil;
  const altura = fundoFunil + GARGALO + RODAPE;

  // As frações, calculadas de uma vez: cada faixa precisa saber a largura da
  // seguinte para fechar o trapézio, e nenhuma pode ser maior que a anterior.
  const fracoes: number[] = [];
  for (const [i, stage] of stages.entries()) {
    const bruta = Math.max(stage.volume / topo, MINIMO);
    const anterior = fracoes[i - 1] ?? 1;
    fracoes.push(Math.min(bruta, anterior));
  }
  /** Onde o corpo do funil encontra o gargalo. */
  const fracaoGargalo = LARGURA_GARGALO / FUNIL;
  const bordaEsq = (i: number) =>
    MARGEM_ESQ + (FUNIL * (1 - (fracoes[i] ?? fracaoGargalo))) / 2;

  const grupos = gruposDeFase(stages.length);

  // Até 6 círculos: acima disso a linha vira uma fileira ilegível, e o
  // número de cada canal já está na lista ao lado.
  const visiveis = channels.slice(0, 6);
  const passo = visiveis.length > 0 ? FUNIL / (visiveis.length + 1) : 0;

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
            x1={MARGEM_ESQ + passo}
            y1={TOPO_CANAIS - 20}
            x2={MARGEM_ESQ + passo * visiveis.length}
            y2={TOPO_CANAIS - 20}
            stroke="currentColor"
            className="text-border"
            strokeWidth={2}
          />
          {visiveis.map((canal, i) => {
            const cx = MARGEM_ESQ + passo * (i + 1);
            return (
              <g key={canal.id}>
                {/* Tooltip nativo: o nome inteiro, que o recorte pode cortar. */}
                <title>{`${canal.label || "Canal sem nome"} — ${formatarPercentual(
                  canal.share,
                )} · ${formatarVolume(canal.volume)} prospecções`}</title>
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
                  className="fill-foreground text-[11px] font-bold"
                >
                  {formatarVolume(canal.volume)}
                </text>
                {/* O rótulo sempre acompanha o número. Um nó marcando "0" sem
                    nome não diz nada — e zero é exatamente o caso em que se
                    precisa saber QUAL canal está sem fatia. */}
                <text
                  x={cx}
                  y={TOPO_CANAIS - 42}
                  textAnchor="middle"
                  className="fill-muted text-[9px] font-medium uppercase tracking-wider"
                >
                  {canal.label.trim().length > 0 ? recortar(canal.label) : "sem nome"}
                </text>
                <text
                  x={cx}
                  y={TOPO_CANAIS - 32}
                  textAnchor="middle"
                  className="fill-muted text-[9px] tabular-nums"
                >
                  {formatarPercentual(canal.share)}
                </text>
              </g>
            );
          })}
        </g>
      )}

      {/* As etapas. */}
      {stages.map((stage, i) => {
        const y = TOPO_CANAIS + i * ALTURA_FAIXA;
        const x1 = bordaEsq(i);
        const x2 = LARGURA - MARGEM_DIR - (x1 - MARGEM_ESQ);
        const x4 = bordaEsq(i + 1);
        const x3 = LARGURA - MARGEM_DIR - (x4 - MARGEM_ESQ);
        return (
          <g key={stage.id}>
            <polygon
              points={`${x1},${y} ${x2},${y} ${x3},${y + ALTURA_FAIXA} ${x4},${y + ALTURA_FAIXA}`}
              fill={corDaFaixa(i, stages.length)}
              fillOpacity={0.9}
            />
            {/* Divisa clara entre faixas: dentro de uma fase os tons são
                próximos de propósito, e sem o fio a etapa some na vizinha. */}
            {i > 0 && (
              <line
                x1={x1}
                y1={y}
                x2={x2}
                y2={y}
                stroke="#ffffff"
                strokeOpacity={0.35}
                strokeWidth={1}
              />
            )}
            <text
              x={EIXO}
              y={y + ALTURA_FAIXA / 2 - 2}
              textAnchor="middle"
              fill="#ffffff"
              className="text-[17px] font-bold"
            >
              {formatarVolume(stage.volume)}
            </text>
            <text
              x={EIXO}
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

      {/* As fases, nas duas margens: sigla à esquerda, nome do canvas deitado
          à direita. Cada grupo tem a altura exata das suas faixas. */}
      {grupos.map((grupo) => {
        const meta = FASES[grupo.fase];
        const yInicio = TOPO_CANAIS + grupo.inicio * ALTURA_FAIXA;
        const alturaGrupo = grupo.quantidade * ALTURA_FAIXA;
        const yMeio = yInicio + alturaGrupo / 2;
        return (
          <g key={grupo.fase}>
            <title>{`${meta.sigla} · ${meta.fase} — ${meta.descricao}`}</title>

            {/* Badge da sigla, no desenho do Cronograma: filete da cor da fase
                e o texto em `fill-foreground`, que tem contraste nos dois
                temas — a cor da fase como texto não teria. */}
            <rect
              x={MARGEM_ESQ - 70}
              y={yMeio - 23}
              width={52}
              height={21}
              rx={6}
              fill={meta.cor}
              fillOpacity={0.15}
              stroke={meta.cor}
              strokeOpacity={0.45}
              strokeWidth={1}
            />
            <text
              x={MARGEM_ESQ - 44}
              y={yMeio - 8}
              textAnchor="middle"
              className="fill-foreground text-[11px] font-semibold"
            >
              {meta.sigla}
            </text>

            {/* O nome da fase no canvas, deitado — na horizontal, logo abaixo
                da sigla. Alinhado à direita, encostando no funil: assim o
                rótulo cresce para dentro da margem em vez de invadir o
                desenho, e "Relacionamento" cabe sem encolher a fonte. */}
            <text
              x={MARGEM_ESQ - 18}
              y={yMeio + 12}
              textAnchor="end"
              className="fill-muted text-[8px] font-semibold uppercase tracking-[0.06em]"
            >
              {meta.fase}
            </text>

            {/* Filete ligando o rótulo às faixas do grupo: é o que diz QUAIS
                etapas a sigla cobre quando o MoFu tem quatro delas. */}
            <rect
              x={MARGEM_ESQ - 10}
              y={yInicio + 3}
              width={3}
              height={alturaGrupo - 6}
              rx={1.5}
              fill={meta.cor}
              fillOpacity={0.55}
            />
          </g>
        );
      })}

      {/* O gargalo e os negócios convertidos: o bico do funil e o que sai por
          ele. A haste é sólida, na cor do fechamento, e não uma linha fina:
          é a continuação do corpo, não um conector. */}
      <g>
        <rect
          x={EIXO - LARGURA_GARGALO / 2}
          y={fundoFunil}
          width={LARGURA_GARGALO}
          height={GARGALO}
          fill={FASES.BOFU.cor}
          fillOpacity={0.9}
        />
        {/* O nó final é sólido e traz o número DENTRO, em branco, como as
            faixas acima: é o resultado do funil e precisa da mesma presença
            que as etapas que levam até ele. */}
        <circle
          cx={EIXO}
          cy={fundoFunil + GARGALO + 34}
          r={34}
          fill="#1e1b3a"
          stroke="#0f0d22"
          strokeWidth={2}
        />
        <text
          x={EIXO}
          y={fundoFunil + GARGALO + 41}
          textAnchor="middle"
          fill="#ffffff"
          className="text-[19px] font-bold"
        >
          {formatarVolume(conversoes)}
        </text>
        <text
          x={EIXO}
          y={fundoFunil + GARGALO + 82}
          textAnchor="middle"
          className="fill-muted text-[10px] font-semibold uppercase tracking-[0.15em]"
        >
          Negócios convertidos
        </text>
      </g>
    </svg>
  );
}
