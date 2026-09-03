import type { OptionTally } from "@/lib/forms/aggregate";

/**
 * Barras horizontais de uma pergunta de opções.
 *
 * Uma cor só, `accent`. Nunca `primary` — reprova contraste no tema claro e é
 * a cor de ação, então barra verde num painel lê como coisa clicável. E nunca
 * cor por opção: o par accent/info é indistinguível em deuteranopia, e a cor
 * não codificaria nada de qualquer modo, já que o rótulo está ao lado.
 */
export function AnswerBars({ options }: { options: readonly OptionTally[] }) {
  const max = Math.max(1, ...options.map((o) => o.count));

  return (
    <div className="space-y-2.5">
      {options.map((option) => (
        <div key={option.optionId} className="flex items-center gap-3">
          <span className="w-40 shrink-0 truncate text-sm text-foreground" title={option.label}>
            {option.label}
          </span>
          <div className="h-5 flex-1 overflow-hidden rounded-md bg-surface-3">
            <div
              className="h-full rounded-md bg-accent transition-[width] duration-300"
              style={{ width: `${(option.count / max) * 100}%` }}
            />
          </div>
          {/* Valor escrito: a identidade nunca depende só da cor. */}
          <span className="w-20 shrink-0 text-right text-sm tabular-nums text-muted">
            {option.count} · {option.percent}%
          </span>
        </div>
      ))}
    </div>
  );
}
