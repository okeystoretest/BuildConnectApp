"use client";

import { Eye, FileText, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { PermissionGate } from "@/components/layout/permission-gate";
import type { IntegrationMap } from "@/types/hr";

export function IntegrationMapsPanel({
  maps,
  onUpload,
}: {
  maps: readonly IntegrationMap[];
  onUpload?: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <PermissionGate permission="content.upload">
          <Button variant="outline" onClick={onUpload}>
            <Upload className="h-4 w-4" />
            Enviar mapa (PDF)
          </Button>
        </PermissionGate>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {maps.map((map) => (
          <article key={map.id} className="rounded-xl border border-border bg-surface p-4">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-danger/15 text-danger">
                <FileText className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-sm font-semibold text-foreground">{map.title}</h3>
                <p className="truncate text-xs text-muted">{map.scope}</p>
              </div>
              <Badge tone={map.status === "CONCLUIDO" ? "primary" : "accent"} className="shrink-0">
                {map.status === "CONCLUIDO" ? "Concluído" : "Em andamento"}
              </Badge>
            </div>

            <div className="mt-4">
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="text-muted">Progresso</span>
                <span className="font-semibold text-primary">{map.progress}%</span>
              </div>
              <Progress value={map.progress} label={`Progresso de ${map.title}`} />
            </div>

            <a
              href={map.filePath ?? "#"}
              target="_blank"
              rel="noopener noreferrer"
              aria-disabled={!map.filePath}
              className={cn(
                "focus-ring mt-4 flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-surface-2 text-xs text-foreground transition-colors hover:bg-surface-3",
                !map.filePath && "pointer-events-none opacity-40",
              )}
            >
              <Eye className="h-3.5 w-3.5" />
              Ver PDF
            </a>
          </article>
        ))}
      </div>
    </div>
  );
}
