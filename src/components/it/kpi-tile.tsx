import { cn } from "@/lib/utils";

export interface KpiTileProps {
  icon: React.ReactNode;
  value: string | number;
  label: string;
  hint?: string;
  tone?: "default" | "warning" | "info" | "accent" | "primary";
}

const TONES = {
  default: "text-foreground",
  warning: "text-warning",
  info: "text-info",
  accent: "text-accent",
  primary: "text-primary",
} as const;

export function KpiTile({ icon, value, label, hint, tone = "default" }: KpiTileProps) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-surface p-4">
      <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-2", TONES[tone])}>
        {icon}
      </span>
      <div className="min-w-0">
        <p className={cn("text-2xl font-bold leading-none tracking-tight", TONES[tone])}>{value}</p>
        <p className="mt-1 truncate text-xs text-foreground">{label}</p>
        {hint && <p className="truncate text-[11px] text-muted">{hint}</p>}
      </div>
    </div>
  );
}
