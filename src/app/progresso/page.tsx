import { redirect } from "next/navigation";
import { LOGIN_EXPIRED_PATH } from "@/lib/auth/login-redirect";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { Card } from "@/components/ui/card";
import { DonutChart } from "@/components/ui/donut-chart";
import { PendingContent } from "@/components/progress/pending-content";
import { getVerifiedSession } from "@/lib/auth/require-user";
import { getProgressPageData } from "@/lib/progress-page-data";
import type { Role } from "@/types";

export default async function ProgressPage() {
  const session = await getVerifiedSession();
  if (!session) redirect(LOGIN_EXPIRED_PATH);

  const data = await getProgressPageData(session.userId, session.role as Role);

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

      {/* Detalhamento das pendências. O Card é renderizado SEMPRE, inclusive
          vazio: sumir da página ao concluir a última pendência desmontaria o
          player aberto, que é a outra metade do bug do formulário de estrelas
          que piscava. `PendingContent` traz o próprio estado vazio. */}
      <Card className="mt-4 p-5">
        <PendingContent groups={data.pending} />
      </Card>

    </AppShell>
  );
}
