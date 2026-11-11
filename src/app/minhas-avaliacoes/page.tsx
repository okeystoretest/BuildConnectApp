import { redirect } from "next/navigation";
import { LOGIN_EXPIRED_PATH } from "@/lib/auth/login-redirect";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { MyEvaluationsPanel } from "@/components/me/my-evaluations-panel";
import { getVerifiedSession } from "@/lib/auth/require-user";
import { getMyEvaluationTasks } from "@/lib/evaluation-rounds";
import { getMyAnsweredEvaluations } from "@/lib/my-evaluations-history";
import { MULTI_RATER_SLUGS } from "@/lib/evaluation-rounds-config";
import { getEvaluationForm } from "@/lib/evaluation-data";
import { PRE_EFETIVO_SLUG } from "@/lib/sector-evaluations-data";
import type { EvalForm } from "@/types/evaluation";
import type { Role } from "@/types";

export const dynamic = "force-dynamic";

export default async function MyEvaluationsPage() {
  const session = await getVerifiedSession();
  if (!session) redirect(LOGIN_EXPIRED_PATH);

  const role = session.role as Role;

  /*
   * Cada rodada pode ser de um instrumento diferente (Matriz de Decisão,
   * Eficácia 360°) — carrega os formulários por slug e o painel escolhe o
   * certo. O Pré-Efetivo entrou na lista porque os ciclos disponíveis agora
   * aparecem aqui como pendência, e sem o formulário o botão abriria vazio.
   *
   * O PAPEL vai para as duas consultas: ele decide quais Pré-Efetivos entram
   * na fila (Admin todos, Gestor o setor dele) e se as concluídas trazem o
   * trabalho de terceiros (só o Admin).
   */
  const [tasks, loadedForms, answered] = await Promise.all([
    getMyEvaluationTasks(session.userId, role),
    Promise.all([...MULTI_RATER_SLUGS, PRE_EFETIVO_SLUG].map((slug) => getEvaluationForm(slug))),
    getMyAnsweredEvaluations(session.userId, role),
  ]);

  const forms: Record<string, EvalForm> = {};
  for (const form of loadedForms) {
    if (form) forms[form.slug] = form;
  }

  return (
    <AppShell eyebrow="Menu" title="Minhas Avaliações">
      <PageHeader
        title="Minhas Avaliações"
        description="Avaliações designadas a você, sua autoavaliação e o histórico do que já respondeu."
      />
      <Card className="mt-6 p-5">
        <MyEvaluationsPanel
          tasks={tasks}
          forms={forms}
          answered={answered}
          isAdmin={role === "ADMIN"}
        />
      </Card>
    </AppShell>
  );
}
