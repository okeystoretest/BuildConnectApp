import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { Card } from "@/components/ui/card";
import { DonutChart } from "@/components/ui/donut-chart";
import { ProgressLegend } from "@/components/progress/progress-legend";
import { SectorProgressBlock } from "@/components/progress/sector-progress-block";
import { PendingContent } from "@/components/progress/pending-content";
import { EmptyState } from "@/components/ui/empty-state";
import { BarChart3 } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { getProgressPageData } from "@/lib/progress-page-data";

export default async function ProgressPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const data = await getProgressPageData(session.userId);

  return (
    <AppShell eyebrow="Menu" title="Meu Progresso">
      <PageHeader title="Meu Progresso" description="Seu avanço no conteúdo de cada área." />

      {/* Consumo total: círculo de progresso na escala cromática. */}
      <Card className="mt-6 p-5">
        <div className="grid gap-6 lg:grid-cols-[auto_1fr] lg:items-center">
          <div className="flex justify-center lg:justify-start">
            <DonutChart
              value={data.overall}
              size={148}
              caption={`${data.consumedItems} de ${data.totalItems} conteúdos consumidos`}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Progresso geral" value={`${data.overall}%`} tone="primary" />
            <StatCard label="Áreas mapeadas" value={data.mappedAreas} />
            <StatCard label="Itens pendentes" value={data.pendingItems} tone="warning" />
          </div>
        </div>
      </Card>

      {/* Detalhamento das pendências, agrupado por setor. */}
      {data.pending.length > 0 && (
        <Card className="mt-4 p-5">
          <PendingContent groups={data.pending} />
        </Card>
      )}

      {/* Progresso por área. */}
      <Card className="mt-4 p-5">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-foreground">Progresso por Área</h2>
          <ProgressLegend />
        </div>

        {data.sectors.length > 0 ? (
          <div className="space-y-7">
            {data.sectors.map((sector) => (
              <SectorProgressBlock key={sector.sector} sector={sector} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<BarChart3 className="h-5 w-5" />}
            title="Nenhum conteúdo mapeado ainda"
            description="Quando houver vídeos e documentos cadastrados nas áreas, seu progresso aparece aqui."
          />
        )}
      </Card>
    </AppShell>
  );
}
