import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { MyEvaluationsPanel } from "@/components/me/my-evaluations-panel";
import { getVerifiedSession } from "@/lib/auth/require-user";
import { getMyEvaluationTasks } from "@/lib/evaluation-rounds";
import { MULTI_RATER_SLUGS } from "@/lib/evaluation-rounds-config";
import { getEvaluationForm } from "@/lib/evaluation-data";
import type { EvalForm } from "@/types/evaluation";

export const dynamic = "force-dynamic";

export default async function MyEvaluationsPage() {
  const session = await getVerifiedSession();
  if (!session) redirect("/login");

  // Cada rodada pode ser de um instrumento diferente (Matriz de Decisão,
  // Eficácia 360°) — carrega os formulários por slug e o painel escolhe o certo.
  const [tasks, loadedForms] = await Promise.all([
    getMyEvaluationTasks(session.userId),
    Promise.all(MULTI_RATER_SLUGS.map((slug) => getEvaluationForm(slug))),
  ]);

  const forms: Record<string, EvalForm> = {};
  for (const form of loadedForms) {
    if (form) forms[form.slug] = form;
  }

  return (
    <AppShell eyebrow="Menu" title="Minhas Avaliações">
      <PageHeader
        title="Minhas Avaliações"
        description="Avaliações designadas a você e sua autoavaliação."
      />
      <Card className="mt-6 p-5">
        <MyEvaluationsPanel tasks={tasks} forms={forms} />
      </Card>
    </AppShell>
  );
}
