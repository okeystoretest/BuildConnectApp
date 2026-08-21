import { FileText, PlayCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { PendingCategory, PendingItem } from "@/lib/pending-content";

function ItemRow({ item }: { item: PendingItem }) {
  const isVideo = item.kind === "VIDEO";
  return (
    <article className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3 transition-colors hover:border-border-strong">
      <span
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
          isVideo ? "bg-primary/15 text-primary" : "bg-info/15 text-info",
        )}
      >
        {isVideo ? <PlayCircle className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
      </span>

      <div className="min-w-0 flex-1">
        <h4 className="truncate text-sm font-medium text-foreground">{item.title}</h4>
        <p className="truncate text-xs text-muted">
          {item.sector} · {item.meta}
        </p>
      </div>

      <Badge tone={isVideo ? "primary" : "info"} className="shrink-0">
        {isVideo ? "Vídeo" : "Documento"}
      </Badge>
    </article>
  );
}

export function PendingContent({ groups }: { groups: readonly PendingCategory[] }) {
  const total = groups.reduce((sum, group) => sum + group.items.length, 0);

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Pendências por categoria</h3>
        <span className="text-xs text-muted">{total} itens a concluir</span>
      </div>

      <div className="space-y-6">
        {groups.map((group) => (
          <div key={group.category}>
            <div className="mb-2.5 flex items-center gap-2">
              <h4 className="text-[11px] font-semibold uppercase tracking-widest text-muted">
                {group.category}
              </h4>
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-surface-3 px-1.5 text-[10px] font-medium text-muted">
                {group.items.length}
              </span>
            </div>

            <div className="space-y-2">
              {group.items.map((item) => (
                <ItemRow key={item.id} item={item} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
