import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { MyEvaluationsPanel } from "@/components/me/my-evaluations-panel";
import { getSession } from "@/lib/auth/session";
import { getMyEvaluationTasks, EFICACIA_SLUG } from "@/lib/efficacy-rounds";
import { getEvaluationForm } from "@/lib/evaluation-data";

export const dynamic = "force-dynamic";

export default async function MyEvaluationsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [tasks, eficaciaForm] = await Promise.all([
    getMyEvaluationTasks(session.userId),
    getEvaluationForm(EFICACIA_SLUG),
  ]);

  return (
    <AppShell eyebrow="Menu" title="Minhas Avaliações">
      <PageHeader
        title="Minhas Avaliações"
        description="Avaliações designadas a você e sua autoavaliação."
      />
      <Card className="mt-6 p-5">
        <MyEvaluationsPanel tasks={tasks} eficaciaForm={eficaciaForm} />
      </Card>
    </AppShell>
  );
}
