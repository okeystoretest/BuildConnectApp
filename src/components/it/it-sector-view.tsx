"use client";

import { useMemo, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Tabs, TabPanel, type TabItem } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { EvaluationsPanel } from "@/components/hr/evaluations-panel";
import type { SectorEvaluations } from "@/types/evaluation";
import { ContentToolbar, type ViewMode } from "@/components/sector/content-toolbar";
import { VideoCard } from "@/components/sector/video-card";
import { DocumentGrid } from "@/components/sector/document-grid";
import { AppShortcuts } from "@/components/sector/app-shortcuts";
import { UploadAction } from "@/components/sector/upload-action";
import { FileUploadModal } from "@/components/sector/file-upload-modal";
import { VideoBatchUploadModal } from "@/components/sector/video-batch-upload-modal";
import { FilterPills } from "@/components/sector/filter-pills";
import { deriveFilters, matchesFilters } from "@/lib/video-filters";
import { paginate } from "@/lib/paginate";
import { Pagination } from "@/components/ui/pagination";
import { INSTRUCOES_PAGE_SIZE } from "@/lib/instrucoes-video";
import { LinkModal } from "@/components/sector/link-modal";
import { SectorWelcomeVideo } from "@/components/sector/welcome-video";
import type { SectorWelcomeVideo as SectorWelcomeVideoData } from "@/lib/welcome-video-data";
import { KanbanBoard } from "@/components/it/kanban-board";
import { ItDashboard } from "@/components/it/it-dashboard";
import { AiSettingsPanel } from "@/components/it/ai-settings-panel";
import type { AiSettingsView } from "@/lib/ai/settings-data";
import { useRole } from "@/providers/role-provider";
import type { LinkItem, SectorContent } from "@/types/sector";
import type { ItTicket, ItDashboardData } from "@/types/it";

const TABS: readonly TabItem[] = [
  { id: "instrucoes-video", label: "Instruções em Vídeo" },
  { id: "documentos", label: "Documentos" },
  { id: "chamados", label: "Chamados" },
  { id: "dashboard", label: "Dashboard" },
  { id: "avaliacoes", label: "Avaliações" },
  { id: "ia", label: "Inteligência Artificial" },
];

export interface ItSectorViewProps {
  content: SectorContent;
  tickets: ItTicket[];
  dashboard: ItDashboardData;
  evaluations?: SectorEvaluations | null;
  /** Vídeo de boas-vindas do setor (modal + card de gestão). */
  welcome?: SectorWelcomeVideoData | null;
  /** Configuração da IA. Nulo para quem não tem `ai.manage` — a aba some. */
  aiSettings?: AiSettingsView | null;
}

export function ItSectorView({
  content,
  tickets,
  dashboard,
  evaluations,
  welcome,
  aiSettings,
}: ItSectorViewProps) {
  const { can } = useRole();
  const [active, setActive] = useState("chamados");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<ViewMode>("grid");
  const [videoModalOpen, setVideoModalOpen] = useState(false);
  const [docModalOpen, setDocModalOpen] = useState(false);
  const [activeFilters, setActiveFilters] = useState<readonly string[]>([]);
  const [page, setPage] = useState(1);
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [editingLink, setEditingLink] = useState<LinkItem | null>(null);

  // Quem chega aqui já passou pelo RBAC de subsetor no servidor
  // (setores/ti/page.tsx). O que varia por papel são as ações, não o acesso:
  // enviar conteúdo exige content.upload; o resto dos painéis se autolimita
  // (LinksPanel por links.manage, KanbanBoard por tickets.manage/claim).
  const canUpload = can("content.upload");

  // A aba de IA só existe para quem pode configurá-la. A checagem é dupla de
  // propósito: a permissão diz quem PODE, e a prop diz que o servidor de fato
  // ENVIOU a configuração — sem uma das duas, a aba nem é listada.
  const showAi = can("ai.manage") && aiSettings != null;
  const tabs = showAi ? TABS : TABS.filter((tab) => tab.id !== "ia");

  const uploadLabel = !canUpload
    ? undefined
    : active === "instrucoes-video"
      ? "Enviar vídeo"
      : active === "documentos"
        ? "Enviar documento"
        : undefined;

  function openUpload() {
    if (active === "instrucoes-video") setVideoModalOpen(true);
    else if (active === "documentos") setDocModalOpen(true);
  }

  function openLinkModal(link: LinkItem | null) {
    setEditingLink(link);
    setLinkModalOpen(true);
  }

  // Pílulas = tags em uso nos vídeos; mesma regra da página de setor.
  const filters = useMemo(() => deriveFilters(content.videos), [content.videos]);
  const filteredVideos = content.videos.filter(
    (v) =>
      v.title.toLowerCase().includes(query.trim().toLowerCase()) &&
      matchesFilters(v, activeFilters),
  );

  function toggleFilter(filter: string) {
    setActiveFilters((prev) =>
      prev.includes(filter) ? prev.filter((f) => f !== filter) : [...prev, filter],
    );
    setPage(1);
  }

  // 9 por página (3 linhas de 3), sobre a lista já filtrada.
  const videoPage = paginate(filteredVideos, page, INSTRUCOES_PAGE_SIZE);

  return (
    <AppShell
      eyebrow="Setores · Retaguarda"
      title="Retaguarda"
      // Só o quadro de Chamados ocupa a tela toda — como o Cronograma: a
      // largura das colunas cresce quando a barra lateral é recolhida.
      wide={active === "chamados"}
    >
      <PageHeader
        title="Retaguarda"
        description="Gestão de chamados e conteúdos do setor de Retaguarda."
      />

      <SectorWelcomeVideo data={welcome ?? null} />

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <Tabs
          items={tabs}
          value={active}
          onValueChange={(id) => {
            setActive(id);
            setQuery("");
            setPage(1);
          }}
        />
        {uploadLabel && <UploadAction label={uploadLabel} onClick={openUpload} />}
      </div>

      {/* Atalhos abaixo da barra de abas, fora do TabPanel: eles não pertencem
          a aba nenhuma e não devem reanimar a cada troca. */}
      <AppShortcuts
        slug="ti"
        links={content.links}
        sourceLabel={content.appsSourceLabel}
        onCreate={() => openLinkModal(null)}
        onEdit={(link) => openLinkModal(link)}
      />

      <TabPanel tabId={active} className="mt-5">
        {active === "chamados" && <KanbanBoard tickets={tickets} />}
        {active === "dashboard" && <ItDashboard data={dashboard} tickets={tickets} />}

        {active === "instrucoes-video" && (
          <div className="space-y-4">
            <ContentToolbar
              query={query}
              onQueryChange={(q) => {
                setQuery(q);
                setPage(1);
              }}
              placeholder="Buscar vídeo"
              view={view}
              onViewChange={setView}
            />
            {filters.length > 0 && (
              <FilterPills
                filters={filters}
                onChange={() => {}}
                active={activeFilters}
                onToggle={toggleFilter}
              />
            )}
            {filteredVideos.length === 0 ? (
              <EmptyState
                title="Nenhum vídeo encontrado"
                description="Envie vídeos de instrução para a equipe de TI."
              />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {videoPage.items.map((video) => (
                  <VideoCard
                    key={video.id}
                    slug="ti"
                    video={video}
                    suggestions={filters}
                    comprehension
                  />
                ))}
              </div>
            )}
            <Pagination page={videoPage} onChange={setPage} noun="vídeos" />
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

        {active === "ia" && showAi && aiSettings && <AiSettingsPanel settings={aiSettings} />}
      </TabPanel>

      {videoModalOpen && (
        <VideoBatchUploadModal
          slug="ti"
          kind="instrucao-video"
          open
          onClose={() => setVideoModalOpen(false)}
        />
      )}
      <FileUploadModal slug="ti" open={docModalOpen} onClose={() => setDocModalOpen(false)} />
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
