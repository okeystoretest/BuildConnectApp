import { BarChart3, ChevronRight } from "lucide-react";
import type { EvaluationType } from "@/types/hr";

export function EvaluationTypesPanel({ types }: { types: readonly EvaluationType[] }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Selecione o tipo de avaliação para consultar as avaliações realizadas.
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        {types.map((type) => (
          <button
            key={type.id}
            type="button"
            className="focus-ring flex items-center gap-3 rounded-xl border border-border bg-surface p-4 text-left transition-colors hover:border-border-strong"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted">
              <BarChart3 className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold leading-snug text-foreground">{type.title}</p>
              <p className="mt-0.5 text-xs text-muted">
                {type.count} {type.count === 1 ? "avaliação" : "avaliações"}
              </p>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted" />
          </button>
        ))}
      </div>
    </div>
  );
}
