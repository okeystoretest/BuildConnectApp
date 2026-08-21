import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { AreaProgress } from "@/types/content";

interface TrackProps {
  value: number;
  tone: "primary" | "info";
  label: string;
}

function Track({ value, tone, label }: TrackProps) {
  return (
    <div className="flex items-center gap-3">
      <Progress value={value} tone={tone} label={label} className="flex-1" />
      <span
        className={cn(
          "w-10 shrink-0 text-right text-[11px] font-medium",
          tone === "primary" ? "text-primary" : "text-info",
        )}
      >
        {value}%
      </span>
    </div>
  );
}

/** Linha de área com as duas trilhas do design: vídeos (verde) e documentos (azul). */
export function AreaProgressRow({ area }: { area: AreaProgress }) {
  return (
    <div className="grid items-center gap-2 sm:grid-cols-[minmax(6rem,9rem)_1fr] sm:gap-4">
      <p className="truncate text-[13px] text-foreground">{area.area}</p>
      <div className="space-y-1.5">
        <Track value={area.videos} tone="primary" label={`Vídeos de ${area.area}`} />
        <Track value={area.documents} tone="info" label={`Documentos de ${area.area}`} />
      </div>
    </div>
  );
}
