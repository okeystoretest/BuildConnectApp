import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
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
import { HrSectorView } from "@/components/hr/hr-sector-view";
import type { Role } from "@/types";

export const dynamic = "force-dynamic";

export default async function HrSectorPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const role = session.role as Role;
  const isAdmin = role === "ADMIN";

  // O RH concentra apenas os RESULTADOS das avaliações (o preenchimento fica na
  // aba Avaliações de cada setor). Admin gerencia tudo; Gestor vê só os
  // resultados do próprio setor.
  const canHrAdmin = can(role, "sector.hr");
  const canEvaluations = can(role, "evaluations.view");
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
      welcome={welcome}
    />
  );
}
