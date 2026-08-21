import { cn } from "@/lib/utils";

export interface StatCardProps {
  label: string;
  value: string | number;
  tone?: "primary" | "foreground" | "warning";
  hint?: string;
}

const TONES = {
  primary: "text-primary",
  foreground: "text-foreground",
  warning: "text-warning",
} as const;

export function StatCard({ label, value, tone = "foreground", hint }: StatCardProps) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <p className="text-xs text-muted">{label}</p>
      <p className={cn("mt-2 text-3xl font-bold tracking-tight", TONES[tone])}>{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}
