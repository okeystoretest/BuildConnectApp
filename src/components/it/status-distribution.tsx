import { cn } from "@/lib/utils";
import { IT_STATUS_DOT, IT_STATUS_LABEL, IT_STATUS_ORDER } from "@/lib/it-data";
import type { ItTicketStatus } from "@/types/it";

export interface StatusDistributionProps {
  byStatus: Record<ItTicketStatus, number>;
  total: number;
}

export function StatusDistribution({ byStatus, total }: StatusDistributionProps) {
  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-muted">
        Distribuição
      </h3>

      <div className="mb-4 flex h-2 overflow-hidden rounded-full bg-surface-3">
        {IT_STATUS_ORDER.map((status) => {
          const share = total > 0 ? (byStatus[status] / total) * 100 : 0;
          if (share === 0) return null;
          return (
            <span
              key={status}
              className={cn("h-full", IT_STATUS_DOT[status])}
              style={{ width: `${share}%` }}
              aria-hidden
            />
          );
        })}
      </div>

      <ul className="space-y-2">
        {IT_STATUS_ORDER.map((status) => (
          <li key={status} className="flex items-center gap-2 text-xs">
            <span className={cn("h-2 w-2 rounded-full", IT_STATUS_DOT[status])} aria-hidden />
            <span className="flex-1 text-foreground">{IT_STATUS_LABEL[status]}</span>
            <span className="font-medium text-foreground">{byStatus[status]}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
