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
import { AppShortcuts } from "@/components/sector/app-shortcuts";
import { UploadAction } from "@/components/sector/upload-action";
import { FileUploadModal } from "@/components/sector/file-upload-modal";
import { LinkModal } from "@/components/sector/link-modal";
import { SectorWelcomeVideo } from "@/components/sector/welcome-video";
import type { SectorWelcomeVideo as SectorWelcomeVideoData } from "@/lib/welcome-video-data";
import type { LinkItem, SectorContent } from "@/types/sector";

// Chamados e Dashboard saíram daqui: os chamados de Motoristas são geridos no
// Build.Flow (módulo Motorista de lá). O solicitante continua abrindo e
// acompanhando em "Meus Chamados".
const TABS: readonly TabItem[] = [
  { id: "documentos", label: "Documentos" },
  { id: "avaliacoes", label: "Avaliações" },
];

export interface DriverSectorViewProps {
  content: SectorContent;
  evaluations?: SectorEvaluations | null;
  /** Vídeo de boas-vindas do setor (modal + card de gestão). */
  welcome?: SectorWelcomeVideoData | null;
}

export function DriverSectorView({ content, evaluations, welcome }: DriverSectorViewProps) {
  const [active, setActive] = useState("documentos");
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
        description="Conteúdos e avaliações da equipe de rota. Os chamados são geridos no Build.Flow."
        progress={
          content.completion === null ? undefined : { label: "Concluído", value: content.completion }
        }
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

      {/* Atalhos abaixo da barra de abas, fora do TabPanel: eles não pertencem
          a aba nenhuma e não devem reanimar a cada troca. */}
      <AppShortcuts
        slug="motoristas"
        links={content.links}
        sourceLabel={content.appsSourceLabel}
        onCreate={() => openLinkModal(null)}
        onEdit={(link) => openLinkModal(link)}
      />

      <TabPanel tabId={active} className="mt-5">
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

      </TabPanel>

      <FileUploadModal
        slug="motoristas"
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
