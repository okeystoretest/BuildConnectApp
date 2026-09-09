import { notFound, redirect } from "next/navigation";
import { LOGIN_EXPIRED_PATH } from "@/lib/auth/login-redirect";
import { getVerifiedSession } from "@/lib/auth/require-user";
import { can } from "@/lib/permissions";
import { canUseDhoTools } from "@/lib/auth/access";
import { getManagedUsers } from "@/lib/users-data";
import { getHrDocuments, getIntegrationMaps } from "@/lib/hr-content-data";
import { getEmployeeRoster } from "@/lib/hr-history-data";
import { getEvaluationResultsCatalog, getEvaluationSubjects } from "@/lib/evaluation-data";
import {
  getAssignableEvaluationTypes,
  getEvaluationRounds,
  getRaterRoster,
} from "@/lib/evaluation-rounds";
import { getSectorWelcomeVideo } from "@/lib/welcome-video-data";
import { getReportsBoard } from "@/lib/reports/data";
import { getFormsForViewer } from "@/lib/forms/data";
import { HrSectorView } from "@/components/hr/hr-sector-view";
import type { Role } from "@/types";

export const dynamic = "force-dynamic";

export default async function HrSectorPage() {
  const session = await getVerifiedSession();
  if (!session) redirect(LOGIN_EXPIRED_PATH);

  const role = session.role as Role;
  const isAdmin = role === "ADMIN";

  /**
   * O DHO é do DHO. Quem não é lotado nele não entra, em papel nenhum — nem o
   * Gestor de outro setor, que tem `evaluations.view` e `forms.manage` e até
   * aqui enxergava e usava as ferramentas daqui.
   *
   * `notFound()` e não `redirect()`: para quem não é do DHO, a rota não
   * existe. Um desvio para a home confirmaria que ela existe e que a pessoa
   * não tem acesso — informação que ela não precisa ter.
   */
  if (!(await canUseDhoTools(session.userId, role))) notFound();

  // O RH concentra apenas os RESULTADOS das avaliações (o preenchimento fica na
  // aba Avaliações de cada setor). Admin gerencia tudo; Gestor vê só os
  // resultados do próprio setor.
  const canHrAdmin = can(role, "sector.hr");
  const canEvaluations = can(role, "evaluations.view");
  const canReports = can(role, "reports.manage");
  const canForms = can(role, "forms.manage");
  if (!canHrAdmin && !canEvaluations) notFound();

  // Escopo de resultados: Admin vê tudo; Gestor vê só o setor dele.
  const sectorScope = isAdmin ? null : session.sector ? [session.sector] : [];

  const [
    users,
    documents,
    maps,
    roster,
    resultsCatalog,
    rounds,
    assignableTypes,
    assignSubjects,
    assignRaters,
    reports,
    forms,
  ] = await Promise.all([
    canHrAdmin ? getManagedUsers() : Promise.resolve([]),
    canHrAdmin ? getHrDocuments() : Promise.resolve([]),
    canHrAdmin ? getIntegrationMaps() : Promise.resolve([]),
    canHrAdmin ? getEmployeeRoster() : Promise.resolve([]),
    getEvaluationResultsCatalog(sectorScope),
    getEvaluationRounds(sectorScope),
    getAssignableEvaluationTypes(),
    getEvaluationSubjects(sectorScope),
    getRaterRoster(sectorScope),
    // Denúncias só são lidas por quem pode tratá-las.
    canReports ? getReportsBoard() : Promise.resolve([]),
    // A consulta já recorta por setor; a permissão só evita a ida ao banco.
    canForms ? getFormsForViewer() : Promise.resolve([]),
  ]);

  const welcome = await getSectorWelcomeVideo("rh", session.userId);

  return (
    <HrSectorView
      canHrAdmin={canHrAdmin}
      users={users}
      documents={documents}
      maps={maps}
      roster={roster}
      initialHistory={null}
      resultsCatalog={resultsCatalog}
      assignableTypes={assignableTypes}
      assignSubjects={assignSubjects}
      assignRaters={assignRaters}
      rounds={rounds}
      canReports={canReports}
      reports={reports}
      welcome={welcome}
      forms={forms}
    />
  );
}
