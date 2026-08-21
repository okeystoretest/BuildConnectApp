import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import { progressColor } from "@/lib/progress-color";

export interface PageHeaderProps {
  title: string;
  description?: string;
  progress?: { label: string; value: number };
  action?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, description, progress, action, className }: PageHeaderProps) {
  return (
    <div className={cn("flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between", className)}>
      <div className="min-w-0">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h2>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>

      {progress && (
        <div className="w-full sm:w-56">
          <div className="mb-1.5 flex items-center justify-between text-xs">
            <span className="text-muted">{progress.label}</span>
            <span
              className="font-semibold"
              style={{ color: progressColor(progress.value) }}
            >
              {progress.value}%
            </span>
          </div>
          <Progress value={progress.value} label={progress.label} />
        </div>
      )}

      {action}
    </div>
  );
}
