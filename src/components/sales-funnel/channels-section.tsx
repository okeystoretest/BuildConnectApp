"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatarPercentual, formatarVolume } from "@/lib/sales-funnel/format";
import type { ChannelVolume } from "@/lib/sales-funnel/types";

export interface CanalEditavel {
  key: string;
  label: string;
  strategy: string;
  /** Texto, e não número: a pessoa passa por "" e "1." enquanto digita. */
  share: string;
}

/** Cores da barra de cobertura. Fixas em hex para valer nos dois temas. */
const TONS = ["#3b82f6", "#22c55e", "#f5a524", "#8b5cf6", "#ef4444", "#06b6d4"];

/**
 * Bloco 4 do canvas: por onde entram as oportunidades.
 *
 * A fatia de cada canal é traduzida em número absoluto — é o que amarra a
 * meta a quem tem de entregá-la. A barra mostra a cobertura somada; o texto
 * do que falta ou sobra vem do motor, junto dos demais diagnósticos.
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
  return (
    <section className="space-y-3 rounded-lg border border-border bg-surface-1 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">4 · Canais de venda</h3>
        {!disabled && (
          <Button variant="secondary" size="sm" disabled={canais.length >= 12} onClick={onAdd}>
            Acrescentar canal
          </Button>
        )}
      </div>

      {canais.length === 0 ? (
        <p className="text-sm text-muted">
          Nenhum canal ainda. O canvas recomenda ao menos cinco — base de clientes, indicações,
          Google, feiras, redes sociais.
        </p>
      ) : (
        <>
          {/* Barra de cobertura: cada segmento é a fatia de um canal. */}
          <div
            className="flex h-3 w-full overflow-hidden rounded-full bg-surface-3"
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
          <p className="text-sm text-muted">
            Cobertura: <span className="font-semibold text-fg">{formatarPercentual(cobertura)}</span>
          </p>

          <div className="space-y-2">
            {canais.map((canal, i) => (
              <div key={canal.key} className="rounded-lg border border-border bg-surface-2 p-3">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="min-w-[10rem] flex-1 space-y-1">
                    <label
                      className="text-xs font-medium text-muted"
                      htmlFor={`canal-${canal.key}`}
                    >
                      Canal
                    </label>
                    <Input
                      id={`canal-${canal.key}`}
                      value={canal.label}
                      maxLength={40}
                      disabled={disabled}
                      placeholder="Indicações"
                      onChange={(e) => onChange(canal.key, { label: e.target.value })}
                    />
                  </div>

                  <div className="w-28 space-y-1">
                    <label
                      className="text-xs font-medium text-muted"
                      htmlFor={`fatia-${canal.key}`}
                    >
                      Fatia
                    </label>
                    <div className="flex items-center gap-1">
                      <Input
                        id={`fatia-${canal.key}`}
                        inputMode="decimal"
                        value={canal.share}
                        disabled={disabled}
                        onChange={(e) => onChange(canal.key, { share: e.target.value })}
                      />
                      <span className="text-sm text-muted">%</span>
                    </div>
                  </div>

                  <div className="w-28 space-y-1">
                    <span className="block text-xs font-medium text-muted">Prospecções</span>
                    <p className="truncate text-lg font-semibold tabular-nums">
                      {formatarVolume(volumes[i]?.volume ?? 0)}
                    </p>
                  </div>

                  {!disabled && (
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Remover ${canal.label || "canal"}`}
                      onClick={() => onRemove(canal.key)}
                    >
                      ✕
                    </Button>
                  )}
                </div>

                <div className="mt-2 space-y-1">
                  <label
                    className="text-xs font-medium text-muted"
                    htmlFor={`estrategia-${canal.key}`}
                  >
                    Estratégia e frequência
                  </label>
                  <Textarea
                    id={`estrategia-${canal.key}`}
                    rows={2}
                    maxLength={300}
                    value={canal.strategy}
                    disabled={disabled}
                    placeholder="Ex.: pedir indicação a cada entrega concluída"
                    onChange={(e) => onChange(canal.key, { strategy: e.target.value })}
                  />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
