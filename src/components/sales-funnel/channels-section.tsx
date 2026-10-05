"use client";

import { useId, useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Collapse } from "@/components/ui/collapse";
import {
  formatarPercentual,
  formatarVolume,
  normalizarPercentualDigitado,
} from "@/lib/sales-funnel/format";
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
  erros,
  disabled,
  onChange,
  onAdd,
  onRemove,
}: {
  canais: readonly CanalEditavel[];
  /** Volumes calculados, na mesma ordem dos canais. */
  volumes: readonly ChannelVolume[];
  cobertura: number;
  /**
   * Erro de fatia por canal, indexado pela chave da linha.
   *
   * O bloco mostra o seu próprio diagnóstico porque o painel de resultado não
   * mostra: com o funil completo ele filtra a severidade `erro`, e `o funil
   * está completo` é exatamente o estado em que uma fatia inválida acontece —
   * ela não impede o cálculo, só zera o canal. Até 05/10/2026 a frase existia
   * no motor e nunca chegava à tela.
   */
  erros: ReadonlyMap<string, string>;
  disabled: boolean;
  onChange: (key: string, patch: Partial<CanalEditavel>) => void;
  onAdd: () => void;
  onRemove: (key: string) => void;
}) {
  const [aberto, setAberto] = useState<string | null>(null);
  // `useId` e não a chave da linha: a chave vem de um contador do módulo, e
  // como atributo do DOM ela divergiria entre servidor e cliente.
  const uid = useId();

  return (
    <CanvasBlock
      numero={3}
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
              const erro = erros.get(canal.key);
              const erroId = `${uid}-fatia-${i}`;
              return (
                <div
                  key={canal.key}
                  className={cn(
                    "rounded-md border bg-surface-2 px-2 py-1.5",
                    erro ? "border-danger/60" : "border-border",
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    <span
                      aria-hidden
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: TONS[i % TONS.length] }}
                    />
                    <Input
                      aria-label={`Nome do canal ${i + 1}`}
                      // O nome inteiro no tooltip: a coluna é estreita e um
                      // "Base de clientes inativos" não cabe no campo.
                      title={canal.label || undefined}
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
                        aria-invalid={erro ? true : undefined}
                        aria-describedby={erro ? erroId : undefined}
                        className={cn(
                          "h-7 w-16 px-1 text-center text-sm tabular-nums",
                          erro && "border-danger text-danger",
                        )}
                        onChange={(e) => onChange(canal.key, { share: e.target.value })}
                        // Mesma regra da taxa das etapas: a fatia também
                        // corre em pontos-base, e perde a terceira casa.
                        onBlur={() =>
                          onChange(canal.key, {
                            share: normalizarPercentualDigitado(canal.share),
                          })
                        }
                      />
                      <span className="shrink-0 text-[10px] text-muted">%</span>
                    </div>
                    <span
                      className={cn(
                        "w-20 shrink-0 text-right text-sm font-semibold tabular-nums",
                        erro && "text-muted",
                      )}
                    >
                      {/* Travessão, e não "0": o canal não responde por zero
                          prospecções, ele não tem número enquanto a fatia não
                          fizer sentido. É o mesmo sinal da coluna de etapas. */}
                      {erro ? "—" : formatarVolume(volumes[i]?.volume ?? 0)}
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

                  {erro && (
                    <p id={erroId} className="mt-1 text-[11px] text-danger">
                      {erro}
                    </p>
                  )}

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
