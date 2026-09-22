"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { Tabs, TabPanel, type TabItem } from "@/components/ui/tabs";
import { MembersGrid } from "./members-grid";
import { VideoQualityTable } from "./video-quality-table";
import type { SectorOverview } from "@/lib/sector-overview-data";

const TABS: readonly TabItem[] = [
  { id: "colaboradores", label: "Colaboradores" },
  { id: "qualidade", label: "Qualidade dos vídeos" },
];

export function SectorOverviewView({
  data,
  sectors,
}: {
  data: SectorOverview;
  sectors: readonly { id: string; label: string }[];
}) {
  const [tab, setTab] = useState("colaboradores");

  return (
    <>
      {/* Seletor só para quem alcança mais de um setor (Admin). O Gestor é
          preso ao próprio setor no servidor — aqui a lista vem vazia. */}
      {sectors.length > 1 && (
        <Card className="mt-6 p-4">
          <label htmlFor="setor" className="text-xs text-muted">
            Setor
          </label>
          <select
            id="setor"
            defaultValue={data.sectorId}
            onChange={(e) => {
              window.location.href = `/meu-setor?setor=${e.target.value}`;
            }}
            className="focus-ring mt-1 block w-full max-w-sm rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
          >
            {sectors.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </Card>
      )}

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
        <Tabs items={TABS} value={tab} onValueChange={setTab} />
        <TabPanel tabId={tab} className="mt-5">
          {tab === "colaboradores" && <MembersGrid members={data.members} />}
          {tab === "qualidade" && <VideoQualityTable videos={data.videos} />}
        </TabPanel>
      </Card>
    </>
  );
}
