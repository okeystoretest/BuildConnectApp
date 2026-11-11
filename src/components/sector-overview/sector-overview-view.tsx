"use client";

import { useMemo, useState } from "react";
import { FileDown, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatCard } from "@/components/ui/stat-card";
import { Tabs, TabPanel, type TabItem } from "@/components/ui/tabs";
import { MembersGrid } from "./members-grid";
import { Pagination } from "@/components/ui/pagination";
import { paginate } from "@/lib/paginate";
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
  canSeeDocuments,
  evaluationsHref,
}: {
  data: SectorOverview;
  scopes: readonly OverviewScope[];
  /**
   * Quem está olhando alcança a documentação pessoal da equipe? Decidido na
   * página, a partir do cadastro de quem abriu — o card só obedece.
   */
  canSeeDocuments: boolean;
  /**
   * Aba onde o avaliador executa uma avaliação avulsa. Resolvida na página a
   * partir de quem abriu; `null` quando não há destino que ele alcance.
   */
  evaluationsHref: string | null;
}) {
  const [tab, setTab] = useState("colaboradores");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const needle = fold(query.trim());

  const members = useMemo(
    () => (needle ? data.members.filter((m) => fold(m.name).includes(needle)) : data.members),
    [data.members, needle],
  );

  /*
   * Nove por página: a grade é de 3 colunas em tela larga, então nove fecham
   * três linhas cheias — meia linha solta no rodapé é o que faz a página
   * parecer cortada.
   */
  const current = paginate(members, page, 9);
  const resetKey = `${needle}|${tab}`;
  const [lastKey, setLastKey] = useState(resetKey);
  if (lastKey !== resetKey) {
    // Renderização, e não efeito: ajustar estado derivado durante o render é o
    // caminho que o React recomenda, e evita o piscar de uma página vazia.
    setLastKey(resetKey);
    setPage(1);
  }

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
        {/* Abas à esquerda; busca e Exportar PDF juntos à direita.
            `flex-wrap` e não largura encolhida: no celular o par desce para a
            linha de baixo inteiro, porque uma busca espremida ao lado das abas
            num telefone não dá para usar. */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Tabs items={TABS} value={tab} onValueChange={setTab} />

          {/* Os dois no mesmo bloco: sem isto o `justify-between` da linha
              joga a busca para o meio, longe do botão com que ela divide o
              canto. */}
          <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
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
  
            {/* Exportar acompanha o RECORTE das pílulas — setor e subsetor —,
                porque é o recorte que tem endereço: ele está na URL, a tela
                inteira obedece a ele, e o arquivo sai com o que se está vendo.

                NÃO acompanha a busca por nome, que é estado do cliente e não
                viaja na URL: um relatório que mudasse conforme o que se
                digitou no campo seria um arquivo que ninguém consegue pedir
                duas vezes igual.
  
                Um link, e não um botão com fetch: a resposta é um arquivo, e o
                download nativo do navegador já faz o trabalho (barra de
                progresso, retomada, pasta de destino) que um `fetch` + Blob
                refaria pior. O `setor` vai na query porque o Admin troca de
                setor pelas pílulas; para o Gestor a rota ignora o parâmetro. */}
            <a
              href={`/api/meu-setor/relatorio?setor=${encodeURIComponent(data.sectorId)}${
                data.subsectorId ? `&subsetor=${encodeURIComponent(data.subsectorId)}` : ""
              }`}
              className="focus-ring inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 text-sm font-semibold text-foreground transition-colors hover:border-border-strong hover:bg-surface-3"
            >
              <FileDown className="h-4 w-4" aria-hidden />
              Exportar PDF
            </a>
          </div>
        </div>

        {/* As pílulas de setor ficam abaixo: primeiro se escolhe o que olhar
            (pessoas ou vídeos), depois de qual setor. O seletor só aparece para
            quem alcança mais de um — o Gestor é preso ao próprio setor no
            servidor, e para ele a lista vem vazia. */}
        <div className="mt-4">
          <ScopePills scopes={scopes} sectorId={data.sectorId} subsectorId={data.subsectorId} />
        </div>

        <TabPanel tabId={tab} className="mt-5">
          {tab === "colaboradores" && (
            <div className="space-y-4">
              <MembersGrid
                members={current.items}
                filtered={Boolean(needle)}
                canSeeDocuments={canSeeDocuments}
                evaluationsHref={evaluationsHref}
              />
              <Pagination page={current} onChange={setPage} noun="colaboradores" />
            </div>
          )}
          {tab === "qualidade" && <VideoQualityGrid videos={videos} filtered={Boolean(needle)} />}
        </TabPanel>
      </Card>
    </>
  );
}
