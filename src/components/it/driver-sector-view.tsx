"use client";

import { useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Tabs, TabPanel, type TabItem } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { EvaluationsPanel } from "@/components/hr/evaluations-panel";
import type { SectorEvaluations } from "@/types/evaluation";
import { ContentToolbar, type ViewMode } from "@/components/sector/content-toolbar";
import { DocumentGrid } from "@/components/sector/document-grid";
import { LinksPanel } from "@/components/sector/links-panel";
import { UploadAction } from "@/components/sector/upload-action";
import { FileUploadModal } from "@/components/sector/file-upload-modal";
import { LinkModal } from "@/components/sector/link-modal";
import { SectorWelcomeVideo } from "@/components/sector/welcome-video";
import type { SectorWelcomeVideo as SectorWelcomeVideoData } from "@/lib/welcome-video-data";
import { DriverKanbanBoard } from "@/components/it/driver-kanban-board";
import { ItDashboard } from "@/components/it/it-dashboard";
import type { LinkItem, SectorContent } from "@/types/sector";
import type { ItTicket, ItDashboardData } from "@/types/it";
import type { DriverLogistics } from "@/lib/driver-data-db";

const TABS: readonly TabItem[] = [
  { id: "chamados", label: "Chamados" },
  { id: "dashboard", label: "Dashboard" },
  { id: "documentos", label: "Documentos" },
  { id: "avaliacoes", label: "Avaliações" },
  { id: "sites", label: "Aplicativos" },
];

export interface DriverSectorViewProps {
  content: SectorContent;
  tickets: ItTicket[];
  dashboard: ItDashboardData;
  logistics: DriverLogistics;
  evaluations?: SectorEvaluations | null;
  /** Vídeo de boas-vindas do setor (modal + card de gestão). */
  welcome?: SectorWelcomeVideoData | null;
}

export function DriverSectorView({ content, tickets, dashboard, logistics, evaluations, welcome }: DriverSectorViewProps) {
  const [active, setActive] = useState("chamados");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<ViewMode>("grid");
  const [docModalOpen, setDocModalOpen] = useState(false);
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [editingLink, setEditingLink] = useState<LinkItem | null>(null);

  function openLinkModal(link: LinkItem | null) {
    setEditingLink(link);
    setLinkModalOpen(true);
  }

  return (
    <AppShell eyebrow="Setores · Logística" title="Motoristas">
      <PageHeader
        title="Motoristas"
        description="Central de chamados e conteúdos da equipe de rota."
        progress={{ label: "Concluído", value: content.completion }}
      />

      <SectorWelcomeVideo data={welcome ?? null} />

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <Tabs
          items={TABS}
          value={active}
          onValueChange={(id) => {
            setActive(id);
            setQuery("");
          }}
        />
        {active === "documentos" && (
          <UploadAction label="Enviar documento" onClick={() => setDocModalOpen(true)} />
        )}
      </div>

      <TabPanel tabId={active} className="mt-5">
        {active === "chamados" && <DriverKanbanBoard tickets={tickets} />}

        {active === "dashboard" && (
          <ItDashboard
            title="Build.Connect · Motoristas"
            data={dashboard}
            tickets={tickets}
            extras={[
              { label: "Quilometragem total", value: `${logistics.totalKm} km` },
              { label: "Média por corrida", value: `${logistics.avgKmPerTrip} km` },
              { label: "Entregas concluídas", value: String(logistics.deliveriesCompleted) },
              { label: "Motoristas ativos", value: String(logistics.activeDrivers) },
            ]}
          />
        )}

        {active === "documentos" && (
          <div className="space-y-4">
            <ContentToolbar
              query={query}
              onQueryChange={setQuery}
              placeholder="Buscar documento"
              view={view}
              onViewChange={setView}
            />
            <DocumentGrid
              documents={content.documents.filter((doc) =>
                doc.name.toLowerCase().includes(query.trim().toLowerCase()),
              )}
            />
          </div>
        )}

        {active === "avaliacoes" &&
          (evaluations ? (
            <EvaluationsPanel
              types={evaluations.types}
              pending={evaluations.pending}
              subjects={evaluations.subjects}
              roster={evaluations.roster}
              preEfetivoForm={evaluations.preEfetivoForm}
              forms={evaluations.forms}
              scope={evaluations.scope}
            />
          ) : (
            <EmptyState
              title="Nenhuma avaliação disponível"
              description="Os ciclos de avaliação dos colaboradores deste setor aparecem aqui quando ficam disponíveis."
            />
          ))}

        {active === "sites" && (
          <LinksPanel
            slug="motoristas"
            links={content.links}
            onCreate={() => openLinkModal(null)}
            onEdit={(link) => openLinkModal(link)}
          />
        )}
      </TabPanel>

      <FileUploadModal
        slug="motoristas"
        kind="documento"
        open={docModalOpen}
        onClose={() => setDocModalOpen(false)}
      />
      <LinkModal
        slug="motoristas"
        link={editingLink}
        open={linkModalOpen}
        onClose={() => {
          setLinkModalOpen(false);
          setEditingLink(null);
        }}
      />
    </AppShell>
  );
}
