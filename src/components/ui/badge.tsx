import { cn } from "@/lib/utils";

type Tone = "neutral" | "primary" | "accent" | "warning" | "info" | "danger";

const TONES: Record<Tone, string> = {
  neutral: "bg-surface-3 text-muted border-border",
  primary: "bg-primary/15 text-primary border-primary/25",
  accent: "bg-accent/15 text-accent border-accent/30",
  warning: "bg-warning/15 text-warning border-warning/30",
  info: "bg-info/15 text-info border-info/30",
  danger: "bg-danger/15 text-danger border-danger/30",
};

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
}

export function Badge({ className, tone = "neutral", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
        TONES[tone],
        className,
      )}
      {...props}
    />
  );
}
