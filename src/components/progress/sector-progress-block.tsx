import * as Icons from "lucide-react";
import type { SectorProgress } from "@/types/content";
import { AreaProgressRow } from "./area-progress-row";

function Icon({ name }: { name: string }) {
  const Cmp = (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[name];
  return Cmp ? <Cmp className="h-3.5 w-3.5" /> : null;
}

export function SectorProgressBlock({ sector }: { sector: SectorProgress }) {
  return (
    <section className="space-y-4">
      <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-muted">
        <span className="text-accent">
          <Icon name={sector.icon} />
        </span>
        {sector.sector}
      </h3>
      <div className="space-y-4">
        {sector.areas.map((area) => (
          <AreaProgressRow key={area.area} area={area} />
        ))}
      </div>
    </section>
  );
}
