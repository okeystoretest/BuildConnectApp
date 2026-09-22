"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatCard } from "@/components/ui/stat-card";
import { Tabs, TabPanel, type TabItem } from "@/components/ui/tabs";
import { MembersGrid } from "./members-grid";
import { ScopePills } from "./scope-pills";
import { VideoQualityGrid } from "./video-quality-grid";
import type { OverviewScope, SectorOverview } from "@/lib/sector-overview-data";

const TABS: readonly TabItem[] = [
  { id: "colaboradores", label: "Colaboradores" },
  { id: "qualidade", label: "Qualidade dos vídeos" },
];

/** Normaliza para busca: sem acento, minúsculo. "Joao" acha "João". */
function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

export function SectorOverviewView({
  data,
  scopes,
}: {
  data: SectorOverview;
  scopes: readonly OverviewScope[];
}) {
  const [tab, setTab] = useState("colaboradores");
  const [query, setQuery] = useState("");

  const needle = fold(query.trim());
  const members = useMemo(
    () => (needle ? data.members.filter((m) => fold(m.name).includes(needle)) : data.members),
    [data.members, needle],
  );
  const videos = useMemo(
    () => (needle ? data.videos.filter((v) => fold(v.title).includes(needle)) : data.videos),
    [data.videos, needle],
  );

  return (
    <>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Progresso do setor" value={`${data.progress}%`} tone="primary" />
        <StatCard
          label="Média do setor"
          value={
            data.average === null
              ? "—"
              : data.average.toLocaleString("pt-BR", { maximumFractionDigits: 1 })
          }
          hint="Só notas aprovadas (7 ou mais)"
        />
        <StatCard label="Colaboradores" value={data.memberCount} />
        <StatCard label="Reprovações" value={data.rejections} tone="warning" />
      </div>

      <Card className="mt-4 p-5">
        {/* A busca divide a linha com as abas, encostada à direita: ela opera
            sobre a aba aberta, e ficar ao lado dela diz isso sem legenda.
            `flex-wrap` e não largura encolhida: no celular o campo desce para
            a linha de baixo inteiro, porque uma busca espremida ao lado das
            abas num telefone não dá para usar. */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Tabs items={TABS} value={tab} onValueChange={setTab} />

          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              // O alvo muda com a aba: um campo só, que busca o que está à
              // vista. Dois campos para dois conteúdos que nunca aparecem
              // juntos seria um sempre morto na tela.
              placeholder={
                tab === "colaboradores" ? "Buscar colaborador…" : "Buscar vídeo pelo título…"
              }
              aria-label={tab === "colaboradores" ? "Buscar colaborador" : "Buscar vídeo"}
              className="pl-9"
            />
          </div>
        </div>

        {/* As pílulas de setor ficam abaixo: primeiro se escolhe o que olhar
            (pessoas ou vídeos), depois de qual setor. O seletor só aparece para
            quem alcança mais de um — o Gestor é preso ao próprio setor no
            servidor, e para ele a lista vem vazia. */}
        <div className="mt-4">
          <ScopePills scopes={scopes} sectorId={data.sectorId} />
        </div>

        <TabPanel tabId={tab} className="mt-5">
          {tab === "colaboradores" && <MembersGrid members={members} filtered={Boolean(needle)} />}
          {tab === "qualidade" && <VideoQualityGrid videos={videos} filtered={Boolean(needle)} />}
        </TabPanel>
      </Card>
    </>
  );
}
