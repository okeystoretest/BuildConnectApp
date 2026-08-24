"use client";

import { useState } from "react";
import { ShieldAlert } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Tabs, TabPanel, type TabItem } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { EvaluationsPanel } from "@/components/hr/evaluations-panel";
import type { SectorEvaluations } from "@/types/evaluation";
import { ContentToolbar, type ViewMode } from "@/components/sector/content-toolbar";
import { VideoCard } from "@/components/sector/video-card";
import { DocumentGrid } from "@/components/sector/document-grid";
import { LinksPanel } from "@/components/sector/links-panel";
import { UploadAction } from "@/components/sector/upload-action";
import { FileUploadModal } from "@/components/sector/file-upload-modal";
import { LinkModal } from "@/components/sector/link-modal";
import { KanbanBoard } from "@/components/it/kanban-board";
import { ItDashboard } from "@/components/it/it-dashboard";
import { useRole } from "@/providers/role-provider";
import type { LinkItem, SectorContent } from "@/types/sector";
import type { ItTicket, ItDashboardData } from "@/types/it";

const TABS: readonly TabItem[] = [
  { id: "instrucoes-video", label: "Instruções em Vídeo" },
  { id: "documentos", label: "Documentos" },
  { id: "chamados", label: "Chamados" },
  { id: "dashboard", label: "Dashboard" },
  { id: "avaliacoes", label: "Avaliações" },
  { id: "sites", label: "Aplicativos" },
];

export interface ItSectorViewProps {
  content: SectorContent;
  tickets: ItTicket[];
  dashboard: ItDashboardData;
  evaluations?: SectorEvaluations | null;
}

export function ItSectorView({ content, tickets, dashboard, evaluations }: ItSectorViewProps) {
  const { can } = useRole();
  const [active, setActive] = useState("chamados");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<ViewMode>("grid");
  const [fileModal, setFileModal] = useState<"instrucao-video" | "documento" | null>(null);
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [editingLink, setEditingLink] = useState<LinkItem | null>(null);

  if (!can("sector.it")) {
    return (
      <AppShell eyebrow="Setores · Retaguarda" title="Retaguarda">
        <EmptyState
          icon={<ShieldAlert className="h-5 w-5" />}
          title="Acesso restrito"
          description="Esta área é exclusiva da administração. Fale com o DHO se precisar de acesso."
        />
      </AppShell>
    );
  }

  const uploadLabel =
    active === "instrucoes-video"
      ? "Enviar vídeo"
      : active === "documentos"
        ? "Enviar documento"
        : undefined;

  function openUpload() {
    if (active === "instrucoes-video") setFileModal("instrucao-video");
    else if (active === "documentos") setFileModal("documento");
  }

  function openLinkModal(link: LinkItem | null) {
    setEditingLink(link);
    setLinkModalOpen(true);
  }

  const filteredVideos = content.videos.filter((v) =>
    v.title.toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <AppShell eyebrow="Setores · Retaguarda" title="Retaguarda">
      <PageHeader
        title="Retaguarda"
        description="Gestão de chamados e conteúdos do setor de Retaguarda."
      />

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <Tabs
          items={TABS}
          value={active}
          onValueChange={(id) => {
            setActive(id);
            setQuery("");
          }}
        />
        {uploadLabel && <UploadAction label={uploadLabel} onClick={openUpload} />}
      </div>

      <TabPanel tabId={active} className="mt-5">
        {active === "chamados" && <KanbanBoard tickets={tickets} />}
        {active === "dashboard" && <ItDashboard data={dashboard} tickets={tickets} />}

        {active === "instrucoes-video" && (
          <div className="space-y-4">
            <ContentToolbar
              query={query}
              onQueryChange={setQuery}
              placeholder="Buscar vídeo"
              view={view}
              onViewChange={setView}
              showFilter
            />
            {filteredVideos.length === 0 ? (
              <EmptyState
                title="Nenhum vídeo encontrado"
                description="Envie vídeos de instrução para a equipe de TI."
              />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filteredVideos.map((video) => (
                  <VideoCard key={video.id} video={video} />
                ))}
              </div>
            )}
          </div>
        )}

        {active === "documentos" && <DocumentGrid documents={content.documents} />}

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
            slug="ti"
            links={content.links}
            onCreate={() => openLinkModal(null)}
            onEdit={(link) => openLinkModal(link)}
          />
        )}
      </TabPanel>

      {fileModal && (
        <FileUploadModal
          slug="ti"
          kind={fileModal}
          open={fileModal !== null}
          onClose={() => setFileModal(null)}
        />
      )}
      <LinkModal
        slug="ti"
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
