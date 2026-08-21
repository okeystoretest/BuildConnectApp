import { cn } from "@/lib/utils";
import type { DistributionEntry } from "@/types/it";

export interface DistributionPanelProps {
  title: string;
  icon: React.ReactNode;
  entries: readonly DistributionEntry[];
}

export function DistributionPanel({ title, icon, entries }: DistributionPanelProps) {
  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <h3 className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-muted">
        <span className="text-muted">{icon}</span>
        {title}
      </h3>

      <ul className="space-y-2">
        {entries.map((entry) => (
          <li key={entry.label} className="flex items-center gap-2 text-xs">
            <span className={cn("h-2 w-2 shrink-0 rounded-full", entry.color)} aria-hidden />
            <span className="min-w-0 flex-1 truncate text-foreground">{entry.label}</span>
            <span className="shrink-0 font-medium text-foreground">{entry.count}</span>
            <span className="w-10 shrink-0 text-right text-muted">({entry.percent}%)</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
