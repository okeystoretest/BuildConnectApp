"use client";

import { useMemo, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Tabs, TabPanel, type TabItem } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { EmployeeHistoryPanel } from "@/components/hr/employee-history";
import { EvaluationResultsPanel } from "@/components/hr/evaluation-results-panel";
import { EfficacyPanel } from "@/components/hr/efficacy-panel";
import { TrainingResultsPanel } from "@/components/hr/training-results-panel";
import { IntegrationMapsPanel } from "@/components/hr/integration-maps";
import { HrDocumentsPanel } from "@/components/hr/hr-documents";
import { UserManagementPanel } from "@/components/hr/user-management";
import { MapUploadModal } from "@/components/hr/map-upload-modal";
import { FileUploadModal } from "@/components/sector/file-upload-modal";
import { useRole } from "@/providers/role-provider";
import type {
  ManagedUser,
  HrDocument,
  IntegrationMap,
  EmployeeSummary,
  EmployeeHistory,
} from "@/types/hr";
import type {
  EvaluationResultGroup,
  EfficacyRoundRow,
  EvaluationSubject,
} from "@/types/evaluation";

export interface HrSectorViewProps {
  canHrAdmin: boolean;
  users: ManagedUser[];
  documents: HrDocument[];
  maps: IntegrationMap[];
  roster: EmployeeSummary[];
  initialHistory: EmployeeHistory | null;
  results: EvaluationResultGroup[];
  // Eficácia 360°: rodadas + gente selecionável.
  efficacyRounds: EfficacyRoundRow[];
  efficacySubjects: EvaluationSubject[];
  efficacyRaters: { id: string; name: string; sector: string }[];
}

export function HrSectorView({
  canHrAdmin,
  users,
  documents,
  maps,
  roster,
  initialHistory,
  results,
  efficacyRounds,
  efficacySubjects,
  efficacyRaters,
}: HrSectorViewProps) {
  const { can } = useRole();
  const [mapModalOpen, setMapModalOpen] = useState(false);
  const [docModalOpen, setDocModalOpen] = useState(false);

  // Abas visíveis dependem do papel:
  // - Admin (sector.hr): tudo, mas Avaliações (preenchimento) NÃO fica no DHO —
  //   fica na aba Avaliações de cada setor. O DHO concentra só os Resultados.
  // - Gestor (evaluations.view, sem sector.hr): só Resultados de Avaliações
  //   (o preenchimento é feito no setor dele).
  const tabs = useMemo<TabItem[]>(() => {
    const evalTabs: TabItem[] = [
      { id: "resultados", label: "Resultados de Avaliações" },
      { id: "eficacia", label: "Eficácia (360°)" },
    ];
    if (!canHrAdmin) return evalTabs;
    return [
      { id: "historico", label: "Histórico do Colaborador" },
      ...evalTabs,
      { id: "treinamento", label: "Resultados de Treinamento" },
      { id: "mapas", label: "Mapas de Integração" },
      { id: "documentos", label: "Documentos" },
      { id: "usuarios", label: "Gestão de Usuários" },
    ];
  }, [canHrAdmin]);

  const [active, setActive] = useState(() => (canHrAdmin ? "historico" : "resultados"));

  // Sem permissão nenhuma (não deveria chegar aqui — a página já barra).
  if (!canHrAdmin && !can("evaluations.view")) {
    return (
      <AppShell eyebrow="Setores · DHO" title="DHO">
        <EmptyState
          icon={<ShieldAlert className="h-5 w-5" />}
          title="Acesso restrito"
          description="Esta área é exclusiva da administração. Fale com o DHO se precisar de acesso."
        />
      </AppShell>
    );
  }

  return (
    <AppShell eyebrow="Setores · DHO" title="DHO">
      <PageHeader
        title="DHO"
        description={
          canHrAdmin
            ? "Gestão de pessoas, integração e documentação."
            : "Avaliações e resultados da sua equipe."
        }
      />

      <div className="mt-6">
        <Tabs items={tabs} value={active} onValueChange={setActive} />
      </div>

      <TabPanel tabId={active} className="mt-5">
        {active === "historico" && canHrAdmin && (
          <EmployeeHistoryPanel roster={roster} initial={initialHistory} />
        )}

        {active === "resultados" && <EvaluationResultsPanel groups={results} />}

        {active === "eficacia" && (
          <EfficacyPanel
            rounds={efficacyRounds}
            subjects={efficacySubjects}
            raters={efficacyRaters}
          />
        )}

        {active === "treinamento" && canHrAdmin && <TrainingResultsPanel />}

        {active === "mapas" && canHrAdmin && (
          <IntegrationMapsPanel maps={maps} onUpload={() => setMapModalOpen(true)} />
        )}
        {active === "documentos" && canHrAdmin && (
          <HrDocumentsPanel documents={documents} onUpload={() => setDocModalOpen(true)} />
        )}
        {active === "usuarios" && canHrAdmin && <UserManagementPanel users={users} />}
      </TabPanel>

      <MapUploadModal open={mapModalOpen} onClose={() => setMapModalOpen(false)} />
      <FileUploadModal
        slug="rh"
        kind="documento"
        open={docModalOpen}
        onClose={() => setDocModalOpen(false)}
      />
    </AppShell>
  );
}
