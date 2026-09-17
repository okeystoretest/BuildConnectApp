"use client";

import { useCallback, useMemo, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Tabs, TabPanel, type TabItem } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { useRole } from "@/providers/role-provider";
import { cn } from "@/lib/utils";
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
import { VideoBatchUploadModal, type VideoUploadKind } from "./video-batch-upload-modal";
import { deriveFilters, matchesFilters } from "@/lib/video-filters";
import { paginate } from "@/lib/paginate";
import { INSTRUCOES_PAGE_SIZE } from "@/lib/instrucoes-video";
import { Pagination } from "@/components/ui/pagination";
import { LinkModal } from "./link-modal";
import { SectorWelcomeVideo } from "./welcome-video";
import type { SectorWelcomeVideo as SectorWelcomeVideoData } from "@/lib/welcome-video-data";
import { EvaluationsPanel } from "@/components/hr/evaluations-panel";
import { CronogramaPanel } from "@/components/cronograma/cronograma-panel";
import type { SectorEvaluations } from "@/types/evaluation";
import type { CronogramaData } from "@/types/cronograma";

interface TabDef extends TabItem {
  id: TabId;
  permission?: "evaluations.view" | "links.manage";
  uploadLabel?: string;
}

// Vitrine não tem Aplicativos: a ferramenta foi retirada das duas vitrines
// (OKEY e Lov Club). Os atalhos continuam no banco; só a aba saiu.
const VITRINE_TABS: readonly TabDef[] = [
  { id: "fotos", label: "Fotos da Coleção", uploadLabel: "Enviar foto" },
  { id: "videos", label: "Vídeos da Coleção", uploadLabel: "Enviar vídeo" },
  { id: "workshop", label: "Workshop", uploadLabel: "Enviar workshop" },
];

const INSTRUCOES_TAB: TabDef = {
  id: "instrucoes-video",
  label: "Instruções em Vídeo",
  uploadLabel: "Enviar vídeo",
};
const DOCUMENTOS_TAB: TabDef = {
  id: "documentos",
  label: "Documentos",
  uploadLabel: "Enviar documento",
};
const AVALIACOES_TAB: TabDef = {
  id: "avaliacoes",
  label: "Avaliações",
  permission: "evaluations.view",
};
// Aplicativos é consulta: visível para todos. Criar/editar seguem no painel.
const SITES_TAB: TabDef = { id: "sites", label: "Aplicativos" };
/** Aba da ferramenta Cronograma — só entra quando o subsetor a habilita. */
const CRONOGRAMA_TAB: TabDef = { id: "cronograma", label: "Cronograma" };

const PADRAO_TABS: readonly TabDef[] = [
  INSTRUCOES_TAB,
  DOCUMENTOS_TAB,
  AVALIACOES_TAB,
  SITES_TAB,
];

/**
 * Ordem própria dos subsetores com Cronograma (Vendas e Marketing): a
 * ferramenta vem logo depois das instruções, e Aplicativos sobe para antes de
 * Avaliações e Documentos. Os demais setores padrão mantêm PADRAO_TABS.
 */
const CRONOGRAMA_LAYOUT_TABS: readonly TabDef[] = [
  INSTRUCOES_TAB,
  CRONOGRAMA_TAB,
  SITES_TAB,
  AVALIACOES_TAB,
  DOCUMENTOS_TAB,
];

/** Abas que aceitam filtros por pílula. */
const FILTERABLE: readonly TabId[] = ["instrucoes-video"];

export function SectorPage({
  sector,
  evaluations,
  cronograma,
  initialTab,
  welcome,
}: {
  sector: SectorContent;
  evaluations?: SectorEvaluations | null;
  cronograma?: CronogramaData | null;
  initialTab?: string;
  /** Vídeo de boas-vindas do setor (modal + card de gestão). */
  welcome?: SectorWelcomeVideoData | null;
}) {
  const { can } = useRole();

  const tabs = useMemo(() => {
    const source =
      sector.kind === "VITRINE"
        ? // Vitrine com Cronograma não existe hoje; se vier a existir, a
          // ferramenta entra por último, sem deslocar as abas de conteúdo.
          cronograma
          ? [...VITRINE_TABS, CRONOGRAMA_TAB]
          : VITRINE_TABS
        : cronograma
          ? CRONOGRAMA_LAYOUT_TABS
          : PADRAO_TABS;
    return source.filter((tab) => !tab.permission || can(tab.permission));
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
  const [activeFilters, setActiveFilters] = useState<readonly string[]>([]);
  const [page, setPage] = useState(1);
  const [photoModalOpen, setPhotoModalOpen] = useState(false);
  const [videoModal, setVideoModal] = useState<VideoUploadKind | null>(null);
  const [documentModalOpen, setDocumentModalOpen] = useState(false);
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [editingLink, setEditingLink] = useState<LinkItem | null>(null);

  /** Abre o modal de upload correto para a aba atual. */
  function openUpload(tabId: TabId) {
    if (tabId === "fotos") return setPhotoModalOpen(true);
    if (tabId === "videos") return setVideoModal("video");
    if (tabId === "workshop") return setVideoModal("workshop");
    if (tabId === "instrucoes-video") return setVideoModal("instrucao-video");
    if (tabId === "documentos") return setDocumentModalOpen(true);
  }

  function openLinkModal(link: LinkItem | null) {
    setEditingLink(link);
    setLinkModalOpen(true);
  }

  const currentTab = tabs.find((tab) => tab.id === active) ?? tabs[0];
  const activeId = currentTab?.id ?? "videos";
  const filterable = FILTERABLE.includes(activeId);
  const instrucoes = activeId === "instrucoes-video";

  const videos = activeId === "workshop" ? sector.workshops : sector.videos;
  // As pílulas são as tags em uso nos vídeos da aba: atribuir uma tag na
  // edição é o que faz a pílula existir. Também servem de sugestão na edição.
  const filters = useMemo(() => deriveFilters(videos), [videos]);
  const filteredVideos = useMemo(() => {
    const q = query.trim().toLowerCase();
    return videos.filter(
      (v) =>
        v.title.toLowerCase().includes(q) && (!filterable || matchesFilters(v, activeFilters)),
    );
  }, [videos, query, filterable, activeFilters]);

  function toggleFilter(filter: string) {
    setActiveFilters((prev) =>
      prev.includes(filter) ? prev.filter((f) => f !== filter) : [...prev, filter],
    );
    setPage(1);
  }

  // Só Instruções em Vídeo pagina; Coleção e Workshop mostram tudo. O
  // `paginate` já puxa a página para dentro quando a busca encolhe a lista.
  const videoPage = useMemo(
    () => paginate(filteredVideos, page, INSTRUCOES_PAGE_SIZE),
    [filteredVideos, page],
  );
  const shownVideos = instrucoes ? videoPage.items : filteredVideos;

  const filterBar =
    filterable && filtersOpen ? (
      filters.length > 0 ? (
        <FilterPills
          filters={filters}
          onChange={() => {}}
          active={activeFilters}
          onToggle={toggleFilter}
        />
      ) : (
        <p className="text-xs text-muted">
          Nenhum filtro ainda. Os filtros nascem das tags atribuídas na edição de cada vídeo.
        </p>
      )
    ) : null;

  return (
    <AppShell
      eyebrow={`Setores · ${sector.parent}`}
      title={sector.name}
      // Cronograma e Instruções em Vídeo (4 por linha) ocupam a tela toda; as
      // demais abas mantêm a largura de leitura confortável.
      wide={activeId === "cronograma" || instrucoes}
    >
      <PageHeader
        title={sector.name}
        description={sector.description}
        progress={
          sector.completion === null ? undefined : { label: "Concluído", value: sector.completion }
        }
      />

      <SectorWelcomeVideo data={welcome ?? null} />

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <Tabs
          items={tabs}
          value={activeId}
          onValueChange={(id) => {
            setActive(id as TabId);
            setQuery("");
            setPage(1);
            syncTabToUrl(id as TabId);
          }}
        />
        {currentTab?.uploadLabel && (
          <UploadAction label={currentTab.uploadLabel} onClick={() => openUpload(activeId)} />
        )}
      </div>

      <TabPanel tabId={activeId} className="mt-5">
        {activeId === "fotos" && <PhotoGrid photos={sector.photos} />}

        {(activeId === "videos" || activeId === "workshop" || activeId === "instrucoes-video") && (
          <div className="space-y-4">
            <ContentToolbar
              query={query}
              onQueryChange={(q) => {
                setQuery(q);
                setPage(1);
              }}
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
                description="Ajuste a busca ou os filtros para ver outros conteúdos desta área."
              />
            ) : view === "grid" ? (
              <div
                className={cn(
                  "grid gap-4 sm:grid-cols-2 lg:grid-cols-3",
                  // 4 por linha na página larga das Instruções, como o Cronograma.
                  instrucoes && "xl:grid-cols-4",
                )}
              >
                {shownVideos.map((video) => (
                  <VideoCard
                    key={video.id}
                    slug={sector.slug}
                    video={video}
                    suggestions={filters}
                    comprehension={instrucoes}
                  />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {shownVideos.map((video) => (
                  <VideoListRow
                    key={video.id}
                    slug={sector.slug}
                    video={video}
                    suggestions={filters}
                    comprehension={instrucoes}
                  />
                ))}
              </div>
            )}

            {instrucoes && <Pagination page={videoPage} onChange={setPage} noun="vídeos" />}
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
              scope={evaluations.scope}
            />
          ) : (
            <EmptyState
              title="Nenhuma avaliação disponível"
              description="Os ciclos de avaliação dos colaboradores deste setor aparecem aqui quando ficam disponíveis."
            />
          ))}

        {activeId === "cronograma" && cronograma && (
          <CronogramaPanel slug={sector.slug} sectorLabel={sector.name} data={cronograma} />
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
      </TabPanel>

      <PhotoUploadModal
        slug={sector.slug}
        open={photoModalOpen}
        onClose={() => setPhotoModalOpen(false)}
      />
      {videoModal && (
        <VideoBatchUploadModal
          slug={sector.slug}
          kind={videoModal}
          open
          onClose={() => setVideoModal(null)}
        />
      )}
      <FileUploadModal
        slug={sector.slug}
        open={documentModalOpen}
        onClose={() => setDocumentModalOpen(false)}
      />
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
