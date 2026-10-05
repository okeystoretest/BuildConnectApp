"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Collapse } from "@/components/ui/collapse";
import { formatarVolume, normalizarPercentualDigitado } from "@/lib/sales-funnel/format";
import { FASES, faseDaEtapa } from "@/lib/sales-funnel/phases";
import { cn } from "@/lib/utils";

export interface EtapaEditavel {
  /**
   * Identidade da linha enquanto o editor está aberto: o id do banco para as
   * etapas que vieram dele, `nova-N` para as criadas aqui. Não sobrevive ao
   * salvamento — as etapas são apagadas e recriadas, com ids novos —, e nem
   * precisa: ela só serve para casar linha, volume e diagnóstico nesta tela.
   */
  key: string;
  label: string;
  /** Texto, e não número: a pessoa passa por "" e "1." enquanto digita. */
  rate: string;
  transitionRule: string;
}

/**
 * Uma etapa no editor, em uma linha.
 *
 * A taxa é guardada como TEXTO. Converter a cada tecla apagaria o estado
 * intermediário: apagar "50" para escrever "30" passa por "" e por "5", e um
 * número não representa "".
 *
 * A regra de transição fica RECOLHIDA. Com 3 a 6 etapas na tela, outros
 * tantos textareas abertos somavam centenas de pixels quase sempre vazios e
 * empurravam o funil — o assunto da ferramenta — para fora da primeira
 * dobra. Um ponto ao lado do botão indica quando há texto escrito, para que
 * recolhido não vire esquecido.
 */
export function StageRow({
  etapa,
  volume,
  posicao,
  total,
  disabled,
  onChange,
  onMove,
  onRemove,
}: {
  etapa: EtapaEditavel;
  volume: number | null;
  posicao: number;
  total: number;
  disabled: boolean;
  onChange: (patch: Partial<EtapaEditavel>) => void;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const temRegra = etapa.transitionRule.trim().length > 0;
  // A mesma função que pinta o desenho: a sigla da lista e a cor da faixa
  // nunca podem discordar sobre em que fase a etapa está.
  const fase = FASES[faseDaEtapa(posicao, total)];

  return (
    <div className="rounded-md border border-border bg-surface-2 px-2 py-1.5">
      <div className="flex items-center gap-1.5">
        <span className="w-3 shrink-0 text-center text-[10px] font-semibold text-muted">
          {posicao + 1}
        </span>

        {/* A sigla da fase, no desenho de badge do Cronograma. É o que liga
            esta linha à faixa colorida do funil ao lado. */}
        <span
          title={`${fase.sigla} · ${fase.fase} — ${fase.descricao}`}
          className={cn(
            "shrink-0 rounded border px-1 py-px text-[9px] font-semibold leading-none",
            fase.badge,
          )}
        >
          {fase.sigla}
        </span>

        <Input
          aria-label={`Nome da etapa ${posicao + 1}`}
          // O nome inteiro no tooltip: a coluna é estreita e o campo corta
          // "Oportunidades" ou "Negociação" antes do fim.
          title={etapa.label || undefined}
          value={etapa.label}
          maxLength={40}
          disabled={disabled}
          placeholder="Oportunidades"
          className="h-7 min-w-0 flex-1 text-sm"
          onChange={(e) => onChange({ label: e.target.value })}
        />

        <div className="flex shrink-0 items-center gap-0.5">
          <Input
            aria-label={`Taxa de conversão da etapa ${posicao + 1}, em porcento`}
            title={
              etapa.label
                ? `Quanto de "${etapa.label}" avança para a etapa seguinte`
                : "Quanto desta etapa avança para a seguinte"
            }
            inputMode="decimal"
            value={etapa.rate}
            disabled={disabled}
            className="h-7 w-16 px-1 text-center text-sm tabular-nums"
            onChange={(e) => onChange({ rate: e.target.value })}
            // Ao sair do campo, o texto passa a ser o que o motor usa: a
            // terceira casa decimal não sobrevive aos pontos-base, e sumir
            // dela em silêncio deixava o campo contradizendo o volume.
            onBlur={() => onChange({ rate: normalizarPercentualDigitado(etapa.rate) })}
          />
          <span className="shrink-0 text-[10px] text-muted">%</span>
        </div>

        <span className="w-20 shrink-0 text-right text-sm font-semibold tabular-nums">
          {volume === null ? "—" : formatarVolume(volume)}
        </span>

        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          aria-expanded={aberto}
          aria-label={`Regra de transição da etapa ${posicao + 1}`}
          className={cn(
            "relative flex h-6 w-6 shrink-0 items-center justify-center rounded text-xs",
            "text-muted hover:bg-surface-3 hover:text-foreground",
            aberto && "bg-surface-3 text-foreground",
          )}
        >
          ≡
          {temRegra && !aberto && (
            <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-primary" />
          )}
        </button>

        {!disabled && (
          <div className="flex shrink-0">
            <button
              type="button"
              aria-label={`Mover ${etapa.label || "etapa"} para cima`}
              disabled={posicao === 0}
              onClick={() => onMove(-1)}
              className="flex h-6 w-5 items-center justify-center rounded text-xs text-muted hover:bg-surface-3 disabled:opacity-30"
            >
              ↑
            </button>
            <button
              type="button"
              aria-label={`Mover ${etapa.label || "etapa"} para baixo`}
              disabled={posicao === total - 1}
              onClick={() => onMove(1)}
              className="flex h-6 w-5 items-center justify-center rounded text-xs text-muted hover:bg-surface-3 disabled:opacity-30"
            >
              ↓
            </button>
            <button
              type="button"
              aria-label={`Remover ${etapa.label || "etapa"}`}
              // Três é o mínimo do funil: abaixo disso a action recusa, e
              // desabilitar aqui evita a pessoa descobrir isso só ao salvar.
              disabled={total <= 3}
              onClick={onRemove}
              className="flex h-6 w-5 items-center justify-center rounded text-xs text-muted hover:bg-danger/15 hover:text-danger disabled:opacity-30"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      <Collapse open={aberto}>
        <Textarea
          aria-label={`O que faz avançar da etapa ${posicao + 1}`}
          rows={2}
          maxLength={500}
          value={etapa.transitionRule}
          disabled={disabled}
          placeholder="O que faz avançar para a próxima etapa"
          className="mt-1.5 text-sm"
          onChange={(e) => onChange({ transitionRule: e.target.value })}
        />
      </Collapse>
    </div>
  );
}
