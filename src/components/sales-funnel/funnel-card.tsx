"use client";

import { Badge } from "@/components/ui/badge";
import { formatarData, formatarReais, formatarVolume } from "@/lib/sales-funnel/format";
import { cn } from "@/lib/utils";
import type { SalesFunnelListItem, SalesFunnelStatus } from "@/types/sales-funnel";

const STATUS_LABEL: Record<SalesFunnelStatus, string> = {
  RASCUNHO: "Rascunho",
  ATIVO: "Ativo",
  ARQUIVADO: "Arquivado",
};

const STATUS_TONE: Record<SalesFunnelStatus, "neutral" | "primary"> = {
  RASCUNHO: "neutral",
  ATIVO: "primary",
  ARQUIVADO: "neutral",
};

/**
 * O card da lista de funis.
 *
 * A linha de resultado traz os três números que decidem se vale abrir: quanto
 * se quer faturar, quantas vendas isso exige e quantas prospecções o funil
 * pede no topo. Vêm calculados do servidor — o card não depende de JS para
 * mostrar número.
 */
export function FunnelCard({
  funnel,
  onOpen,
}: {
  funnel: SalesFunnelListItem;
  onOpen: (id: string) => void;
}) {
  // Sem conversões o funil ainda não tem meta ou ticket preenchido. Mostrar
  // "0 conversões" faria um funil incompleto parecer um plano de não vender
  // nada.
  const calculado = funnel.requiredConversions > 0;

  return (
    <button
      type="button"
      onClick={() => onOpen(funnel.id)}
      className={cn(
        "flex w-full flex-col gap-1.5 rounded-lg border border-border bg-surface-2 p-3 text-left",
        "transition-colors hover:border-primary/40 hover:bg-surface-3",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
        funnel.status === "ARQUIVADO" && "opacity-60",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold">{funnel.name}</h3>
          <p className="text-[11px] uppercase tracking-wider text-muted">
            {formatarData(funnel.referenceDate)}
          </p>
        </div>
        <Badge tone={STATUS_TONE[funnel.status]}>{STATUS_LABEL[funnel.status]}</Badge>
      </div>

      {calculado ? (
        /* Três números na régua do canvas: quanto se quer, quantas vendas
           isso exige, quantas prospecções o funil pede no topo. */
        <dl className="grid grid-cols-3 gap-1 border-t border-border pt-1.5">
          <div>
            <dt className="text-[9px] uppercase tracking-wider text-muted">Meta</dt>
            <dd className="truncate text-xs font-semibold tabular-nums">
              {formatarReais(funnel.goalCents)}
            </dd>
          </div>
          <div>
            <dt className="text-[9px] uppercase tracking-wider text-muted">Conversões</dt>
            <dd className="text-xs font-semibold tabular-nums">
              {formatarVolume(funnel.requiredConversions)}
            </dd>
          </div>
          <div>
            <dt className="text-[9px] uppercase tracking-wider text-muted">Prospecções</dt>
            <dd className="text-xs font-semibold tabular-nums">
              {formatarVolume(funnel.topVolume)}
            </dd>
          </div>
        </dl>
      ) : (
        <p className="border-t border-border pt-1.5 text-xs text-warning">
          Faltam dados para calcular
        </p>
      )}
    </button>
  );
}
