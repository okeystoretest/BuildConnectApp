"use client";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { formatarVolume } from "@/lib/sales-funnel/format";

export interface EtapaEditavel {
  /** Chave local da linha. Não é o id do banco: as etapas são recriadas. */
  key: string;
  label: string;
  /** Texto, e não número: a pessoa passa por "" e "1." enquanto digita. */
  rate: string;
  transitionRule: string;
}

/**
 * Uma etapa no editor.
 *
 * A taxa é guardada como TEXTO. Converter a cada tecla apagaria o estado
 * intermediário: apagar "50" para escrever "30" passa por "" e por "5", e um
 * número não representa "".
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
  return (
    <div className="rounded-lg border border-border bg-surface-2 p-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[10rem] flex-1 space-y-1">
          <label className="text-xs font-medium text-muted" htmlFor={`etapa-${etapa.key}`}>
            Etapa {posicao + 1}
          </label>
          <Input
            id={`etapa-${etapa.key}`}
            value={etapa.label}
            maxLength={40}
            disabled={disabled}
            placeholder="Oportunidades"
            onChange={(e) => onChange({ label: e.target.value })}
          />
        </div>

        <div className="w-28 space-y-1">
          <label className="text-xs font-medium text-muted" htmlFor={`taxa-${etapa.key}`}>
            Converte
          </label>
          <div className="flex items-center gap-1">
            <Input
              id={`taxa-${etapa.key}`}
              inputMode="decimal"
              value={etapa.rate}
              disabled={disabled}
              onChange={(e) => onChange({ rate: e.target.value })}
            />
            <span className="text-sm text-muted">%</span>
          </div>
        </div>

        <div className="w-24 space-y-1">
          <span className="block text-xs font-medium text-muted">Precisa de</span>
          <p className="truncate text-lg font-semibold tabular-nums">
            {volume === null ? "—" : formatarVolume(volume)}
          </p>
        </div>

        {!disabled && (
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Mover ${etapa.label || "etapa"} para cima`}
              disabled={posicao === 0}
              onClick={() => onMove(-1)}
            >
              ↑
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Mover ${etapa.label || "etapa"} para baixo`}
              disabled={posicao === total - 1}
              onClick={() => onMove(1)}
            >
              ↓
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Remover ${etapa.label || "etapa"}`}
              // Três é o mínimo do funil: abaixo disso a action recusa, e
              // desabilitar aqui evita a pessoa descobrir isso só ao salvar.
              disabled={total <= 3}
              onClick={onRemove}
            >
              ✕
            </Button>
          </div>
        )}
      </div>

      <div className="mt-2 space-y-1">
        <label className="text-xs font-medium text-muted" htmlFor={`regra-${etapa.key}`}>
          O que faz avançar para a próxima etapa
        </label>
        <Textarea
          id={`regra-${etapa.key}`}
          rows={2}
          maxLength={500}
          value={etapa.transitionRule}
          disabled={disabled}
          placeholder="Ex.: proposta enviada e reunião de follow-up agendada"
          onChange={(e) => onChange({ transitionRule: e.target.value })}
        />
      </div>
    </div>
  );
}
