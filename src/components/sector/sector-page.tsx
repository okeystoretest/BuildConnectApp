"use client";

import { useCallback, useMemo, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Tabs, type TabItem } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { useRole } from "@/providers/role-provider";
import type { LinkItem, SectorContent, TabId } from "@/types/sector";
import { ContentToolbar, type ViewMode } from "./content-toolbar";
import { FilterPills } from "./filter-pills";
import { VideoCard, VideoListRow } from "./video-card";
import { PhotoGrid } from "./photo-grid";
import { DocumentGrid } from "./document-grid";
import { LinksPanel } from "./links-panel";
import { UploadAction } from "./upload-action";
import { PhotoUploadModal } from "./photo-upload-modal";
import { FileUploadModal } from "./file-upload-modal";
import { LinkModal } from "./link-modal";
import { EvaluationsPanel } from "@/components/hr/evaluations-panel";
import { CronogramaPanel } from "@/components/cronograma/cronograma-panel";
import type { SectorEvaluations } from "@/types/evaluation";
import type { CronogramaData } from "@/types/cronograma";

interface TabDef extends TabItem {
  id: TabId;
  permission?: "evaluations.view" | "links.manage";
  uploadLabel?: string;
}

const VITRINE_TABS: readonly TabDef[] = [
  { id: "fotos", label: "Fotos da Coleção", uploadLabel: "Enviar foto" },
  { id: "videos", label: "Vídeos da Coleção", uploadLabel: "Enviar vídeo" },
  { id: "workshop", label: "Workshop", uploadLabel: "Enviar workshop" },
  // Aplicativos é consulta: visível para todos. Criar/editar seguem no painel.
  { id: "sites", label: "Aplicativos" },
];

const PADRAO_TABS: readonly TabDef[] = [
  { id: "instrucoes-video", label: "Instruções em Vídeo", uploadLabel: "Enviar vídeo" },
  { id: "documentos", label: "Documentos", uploadLabel: "Enviar documento" },
  { id: "avaliacoes", label: "Avaliações", permission: "evaluations.view" },
  // Aplicativos é consulta: visível para todos. Criar/editar seguem no painel.
  { id: "sites", label: "Aplicativos" },
];

/** Aba da ferramenta Cronograma — só entra quando o subsetor a habilita. */
const CRONOGRAMA_TAB: TabDef = { id: "cronograma", label: "Cronograma" };

/** Abas que aceitam filtros por pílula. */
const FILTERABLE: readonly TabId[] = ["instrucoes-video"];

export function SectorPage({
  sector,
  evaluations,
  cronograma,
  initialTab,
}: {
  sector: SectorContent;
  evaluations?: SectorEvaluations | null;
  cronograma?: CronogramaData | null;
  initialTab?: string;
}) {
  const { can } = useRole();

  const tabs = useMemo(() => {
    const source = sector.kind === "VITRINE" ? VITRINE_TABS : PADRAO_TABS;
    const visible = source.filter((tab) => !tab.permission || can(tab.permission));
    // A ferramenta entra como última aba, sem deslocar as abas de conteúdo.
    return cronograma ? [...visible, CRONOGRAMA_TAB] : visible;
  }, [sector.kind, can, cronograma]);

  const [active, setActive] = useState<TabId>(() => {
    const requested = tabs.find((tab) => tab.id === initialTab)?.id;
    return requested ?? tabs[0]?.id ?? "videos";
  });

  /**
   * Espelha a aba ativa na URL (`?aba=`) sem navegar.
   *
   * `history.replaceState` evita o round-trip do router. O ganho é de
   * robustez: se algo remontar a página (revalidação, voltar do navegador,
   * F5), o servidor lê `aba` e devolve o usuário para onde ele estava, em vez
   * de jogá-lo na primeira aba.
   */
  const syncTabToUrl = useCallback((tabId: TabId) => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("aba", tabId);
    window.history.replaceState(window.history.state, "", url.toString());
  }, []);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<ViewMode>("grid");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<readonly string[]>([]);
  const [activeFilters, setActiveFilters] = useState<readonly string[]>([]);
  const [photoModalOpen, setPhotoModalOpen] = useState(false);
  const [fileModal, setFileModal] = useState<
    "video" | "workshop" | "instrucao-video" | "documento" | null
  >(null);
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [editingLink, setEditingLink] = useState<LinkItem | null>(null);

  /** Abre o modal de upload correto para a aba atual. */
  function openUpload(tabId: TabId) {
    if (tabId === "fotos") return setPhotoModalOpen(true);
    if (tabId === "videos") return setFileModal("video");
    if (tabId === "workshop") return setFileModal("workshop");
    if (tabId === "instrucoes-video") return setFileModal("instrucao-video");
    if (tabId === "documentos") return setFileModal("documento");
  }

  function openLinkModal(link: LinkItem | null) {
    setEditingLink(link);
    setLinkModalOpen(true);
  }

  const currentTab = tabs.find((tab) => tab.id === active) ?? tabs[0];
  const activeId = currentTab?.id ?? "videos";
  const filterable = FILTERABLE.includes(activeId);

  const videos = activeId === "workshop" ? sector.workshops : sector.videos;
  const filteredVideos = useMemo(
    () => videos.filter((v) => v.title.toLowerCase().includes(query.trim().toLowerCase())),
    [videos, query],
  );

  function toggleFilter(filter: string) {
    setActiveFilters((prev) =>
      prev.includes(filter) ? prev.filter((f) => f !== filter) : [...prev, filter],
    );
  }

  const filterBar =
    filterable && filtersOpen ? (
      <FilterPills
        filters={filters}
        onChange={setFilters}
        active={activeFilters}
        onToggle={toggleFilter}
        canManage={can("content.upload")}
      />
    ) : null;

  return (
    <AppShell
      eyebrow={`Setores · ${sector.parent}`}
      title={sector.name}
      // Só o Cronograma ocupa a tela toda; as demais abas mantêm a largura
      // de leitura confortável.
      wide={activeId === "cronograma"}
    >
      <PageHeader
        title={sector.name}
        description={sector.description}
        progress={{ label: "Concluído", value: sector.completion }}
      />

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <Tabs
          items={tabs}
          value={activeId}
          onValueChange={(id) => {
            setActive(id as TabId);
            setQuery("");
            syncTabToUrl(id as TabId);
          }}
        />
        {currentTab?.uploadLabel && (
          <UploadAction label={currentTab.uploadLabel} onClick={() => openUpload(activeId)} />
        )}
      </div>

      <div className="mt-5">
        {activeId === "fotos" && <PhotoGrid photos={sector.photos} />}

        {(activeId === "videos" || activeId === "workshop" || activeId === "instrucoes-video") && (
          <div className="space-y-4">
            <ContentToolbar
              query={query}
              onQueryChange={setQuery}
              placeholder={activeId === "workshop" ? "Buscar workshop" : "Buscar vídeo"}
              view={view}
              onViewChange={setView}
              showFilter={filterable}
              filtersOpen={filtersOpen}
              onToggleFilters={() => setFiltersOpen((v) => !v)}
            />
            {filterBar}

            {filteredVideos.length === 0 ? (
              <EmptyState
                title="Nenhum vídeo encontrado"
                description="Ajuste a busca para ver outros conteúdos desta área."
              />
            ) : view === "grid" ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filteredVideos.map((video) => (
                  <VideoCard key={video.id} video={video} />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {filteredVideos.map((video) => (
                  <VideoListRow key={video.id} video={video} />
                ))}
              </div>
            )}
          </div>
        )}

        {activeId === "documentos" && (
          <div className="space-y-4">
            <ContentToolbar
              query={query}
              onQueryChange={setQuery}
              placeholder="Buscar documento"
              view={view}
              onViewChange={setView}
            />
            <DocumentGrid
              documents={sector.documents.filter((doc) =>
                doc.name.toLowerCase().includes(query.trim().toLowerCase()),
              )}
            />
          </div>
        )}

        {activeId === "avaliacoes" &&
          (evaluations ? (
            <EvaluationsPanel
              types={evaluations.types}
              pending={evaluations.pending}
              subjects={evaluations.subjects}
              roster={evaluations.roster}
              preEfetivoForm={evaluations.preEfetivoForm}
              forms={evaluations.forms}
            />
          ) : (
            <EmptyState
              title="Nenhuma avaliação disponível"
              description="Os ciclos de avaliação dos colaboradores deste setor aparecem aqui quando ficam disponíveis."
            />
          ))}

        {activeId === "cronograma" && cronograma && (
          <CronogramaPanel slug={sector.slug} data={cronograma} />
        )}

        {activeId === "sites" && (
          <LinksPanel
            slug={sector.slug}
            links={sector.links}
            sourceLabel={sector.appsSourceLabel}
            onCreate={() => openLinkModal(null)}
            onEdit={(link) => openLinkModal(link)}
          />
        )}
      </div>

      <PhotoUploadModal
        slug={sector.slug}
        open={photoModalOpen}
        onClose={() => setPhotoModalOpen(false)}
      />
      {fileModal && (
        <FileUploadModal
          slug={sector.slug}
          kind={fileModal}
          open={fileModal !== null}
          onClose={() => setFileModal(null)}
        />
      )}
      <LinkModal
        slug={sector.slug}
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
