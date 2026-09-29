"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Collapse } from "@/components/ui/collapse";
import { formatarPercentual, formatarVolume } from "@/lib/sales-funnel/format";
import { cn } from "@/lib/utils";
import type { ChannelVolume } from "@/lib/sales-funnel/types";
import { CanvasBlock } from "./canvas-block";

export interface CanalEditavel {
  key: string;
  label: string;
  strategy: string;
  /** Texto, e não número: a pessoa passa por "" e "1." enquanto digita. */
  share: string;
}

/** Cores dos segmentos da barra. Fixas em hex para valer nos dois temas. */
const TONS = ["#3b82f6", "#22c55e", "#f5a524", "#8b5cf6", "#ef4444", "#06b6d4"];

/**
 * Bloco 4 do canvas: por onde entram as oportunidades.
 *
 * A fatia de cada canal é traduzida em número absoluto — é o que amarra a
 * meta a quem tem de entregá-la. A estratégia e frequência de cada canal fica
 * recolhida, pelo mesmo motivo da regra de transição das etapas: com cinco
 * canais recomendados, cinco caixas de texto abertas dominariam a coluna.
 */
export function ChannelsSection({
  canais,
  volumes,
  cobertura,
  disabled,
  onChange,
  onAdd,
  onRemove,
}: {
  canais: readonly CanalEditavel[];
  /** Volumes calculados, na mesma ordem dos canais. */
  volumes: readonly ChannelVolume[];
  cobertura: number;
  disabled: boolean;
  onChange: (key: string, patch: Partial<CanalEditavel>) => void;
  onAdd: () => void;
  onRemove: (key: string) => void;
}) {
  const [aberto, setAberto] = useState<string | null>(null);

  return (
    <CanvasBlock
      numero={4}
      titulo="Canais de venda"
      acao={
        !disabled && (
          <button
            type="button"
            onClick={onAdd}
            disabled={canais.length >= 12}
            className="rounded px-1.5 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/10 disabled:opacity-40"
          >
            + canal
          </button>
        )
      }
    >
      {canais.length === 0 ? (
        <p className="text-xs text-muted">
          O canvas recomenda ao menos cinco: base de clientes, indicações, Google, feiras, redes.
        </p>
      ) : (
        <div className="space-y-2">
          {/* Barra de cobertura: cada segmento é a fatia de um canal. */}
          <div>
            <div
              className="flex h-2 w-full overflow-hidden rounded-full bg-surface-3"
              role="img"
              aria-label={`Cobertura dos canais: ${formatarPercentual(cobertura)} da boca do funil`}
            >
              {canais.map((canal, i) => {
                const fatia = Number(canal.share.replace(",", ".")) || 0;
                if (fatia <= 0) return null;
                return (
                  <div
                    key={canal.key}
                    style={{
                      width: `${Math.min(fatia, 100)}%`,
                      backgroundColor: TONS[i % TONS.length],
                    }}
                  />
                );
              })}
            </div>
            <p className="mt-1 text-[11px] text-muted">
              Cobertura{" "}
              <span
                className={cn(
                  "font-semibold tabular-nums",
                  cobertura === 100 ? "text-primary" : "text-warning",
                )}
              >
                {formatarPercentual(cobertura)}
              </span>
            </p>
          </div>

          <div className="space-y-1">
            {canais.map((canal, i) => {
              const temEstrategia = canal.strategy.trim().length > 0;
              const estaAberto = aberto === canal.key;
              return (
                <div
                  key={canal.key}
                  className="rounded-md border border-border bg-surface-2 px-2 py-1.5"
                >
                  <div className="flex items-center gap-1.5">
                    <span
                      aria-hidden
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: TONS[i % TONS.length] }}
                    />
                    <Input
                      aria-label={`Nome do canal ${i + 1}`}
                      value={canal.label}
                      maxLength={40}
                      disabled={disabled}
                      placeholder="Indicações"
                      className="h-7 min-w-0 flex-1 text-sm"
                      onChange={(e) => onChange(canal.key, { label: e.target.value })}
                    />
                    <div className="flex shrink-0 items-center gap-0.5">
                      <Input
                        aria-label={`Fatia do canal ${i + 1}, em porcento`}
                        inputMode="decimal"
                        value={canal.share}
                        disabled={disabled}
                        className="h-7 w-11 px-1 text-center text-sm tabular-nums"
                        onChange={(e) => onChange(canal.key, { share: e.target.value })}
                      />
                      <span className="text-[10px] text-muted">%</span>
                    </div>
                    <span className="w-12 shrink-0 text-right text-sm font-semibold tabular-nums">
                      {formatarVolume(volumes[i]?.volume ?? 0)}
                    </span>
                    <button
                      type="button"
                      onClick={() => setAberto(estaAberto ? null : canal.key)}
                      aria-expanded={estaAberto}
                      aria-label={`Estratégia do canal ${i + 1}`}
                      className={cn(
                        "relative flex h-6 w-6 shrink-0 items-center justify-center rounded text-xs",
                        "text-muted hover:bg-surface-3 hover:text-foreground",
                        estaAberto && "bg-surface-3 text-foreground",
                      )}
                    >
                      ≡
                      {temEstrategia && !estaAberto && (
                        <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-primary" />
                      )}
                    </button>
                    {!disabled && (
                      <button
                        type="button"
                        aria-label={`Remover ${canal.label || "canal"}`}
                        onClick={() => onRemove(canal.key)}
                        className="flex h-6 w-5 shrink-0 items-center justify-center rounded text-xs text-muted hover:bg-danger/15 hover:text-danger"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  <Collapse open={estaAberto}>
                    <Textarea
                      aria-label={`Estratégia e frequência do canal ${i + 1}`}
                      rows={2}
                      maxLength={300}
                      value={canal.strategy}
                      disabled={disabled}
                      placeholder="Estratégia e frequência"
                      className="mt-1.5 text-sm"
                      onChange={(e) => onChange(canal.key, { strategy: e.target.value })}
                    />
                  </Collapse>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </CanvasBlock>
  );
}
