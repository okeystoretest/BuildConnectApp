"use client";

import { useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { WeeklyReportDetail } from "@/types/weekly-report";
import { useSalvarPendencias } from "./pendencias";
import { ResumoSection } from "./resumo-section";
import {
  AgendaSection,
  DeliveriesSection,
  MetricsSection,
  OkrsSection,
} from "./report-sections";
import { BlockersSection } from "./blockers-section";

/** Os seis blocos do relatório, na ordem em que se preenchem. */
export const PASSOS = [
  { id: "resumo", label: "1 · Resumo" },
  { id: "entregas", label: "2 · Entregas" },
  { id: "metricas", label: "3 · Canais e métricas" },
  { id: "okrs", label: "4 · OKRs" },
  { id: "bloqueios", label: "5 · Bloqueios" },
  { id: "pauta", label: "6 · Pauta" },
] as const;

/**
 * Os seis blocos, um por vez.
 *
 * Um por vez, e não os seis empilhados, porque a página inteira de uma sexta
 * cansa antes do terceiro bloco: "Próximo" avança, e a barra de cima mostra
 * onde se está e deixa pular direto para qualquer bloco.
 *
 * Os seis ficam MONTADOS; só o do passo atual aparece. Cada bloco guarda o
 * que foi digitado em estado local, e desmontá-lo ao avançar jogaria fora o
 * texto ainda não salvo.
 *
 * Avançar GRAVA o bloco. Sem isso, "Próximo" seria um lugar bom para perder
 * texto — no modal da semana nova, concluir fecha a janela e levaria tudo o
 * que não tivesse passado pelo "Salvar" de cada bloco.
 *
 * `onConcluir`, quando vem, é o modo modal: o último passo troca "Próximo"
 * por "Salvar", e a barra de progresso aparece como nas avaliações.
 */
export function ReportSteps({
  slug,
  detail,
  onConcluir,
}: {
  slug: string;
  detail: WeeklyReportDetail;
  onConcluir?: () => void;
}) {
  const [passo, setPasso] = useState(0);
  const [indo, setIndo] = useState(false);
  const barra = useRef<HTMLDivElement>(null);
  const salvarPendencias = useSalvarPendencias();

  async function ir(indice: number) {
    if (indo) return;
    // Só ao avançar: voltar não perde nada (os blocos seguem montados), e
    // gravar na volta prenderia quem está tentando sair de um bloco cujo
    // salvamento falhou.
    if (indice > passo) {
      setIndo(true);
      const ok = await salvarPendencias();
      setIndo(false);
      if (!ok) return;
    }
    setPasso(indice);
    // Quem chegou ao fim de uma tabela longa está com a barra de passos fora
    // da tela; sem isto o bloco seguinte abriria acima do campo visível.
    barra.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  async function concluir() {
    if (indo || !onConcluir) return;
    setIndo(true);
    const ok = await salvarPendencias();
    setIndo(false);
    if (ok) onConcluir();
  }

  const ultimo = passo === PASSOS.length - 1;

  return (
    <div className="space-y-4">
      {onConcluir && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="font-semibold text-foreground">{PASSOS[passo]!.label}</span>
            <span className="text-muted">
              Passo {passo + 1} de {PASSOS.length}
            </span>
          </div>
          <Progress
            value={((passo + 1) / PASSOS.length) * 100}
            tone="primary"
            label={`Passo ${passo + 1} de ${PASSOS.length}`}
          />
        </div>
      )}

      <div ref={barra}>
        <Tabs
          items={PASSOS}
          value={PASSOS[passo]!.id}
          onValueChange={(id) => void ir(PASSOS.findIndex((p) => p.id === id))}
        />
      </div>

      {[
        <ResumoSection key="resumo" slug={slug} detail={detail} />,
        <DeliveriesSection
          key="entregas"
          slug={slug}
          reportId={detail.id}
          canEdit={detail.canEdit}
          deliveries={detail.deliveries}
        />,
        <MetricsSection
          key="metricas"
          slug={slug}
          reportId={detail.id}
          canEdit={detail.canEdit}
          metrics={detail.metrics}
        />,
        <OkrsSection
          key="okrs"
          slug={slug}
          reportId={detail.id}
          canEdit={detail.canEdit}
          okrs={detail.okrs}
        />,
        <BlockersSection
          key="bloqueios"
          slug={slug}
          reportId={detail.id}
          canEdit={detail.canEdit}
          blockers={detail.blockers}
        />,
        <AgendaSection
          key="pauta"
          slug={slug}
          reportId={detail.id}
          canEdit={detail.canEdit}
          agenda={detail.agenda}
        />,
      ].map((secao, i) => (
        <div key={PASSOS[i]!.id} className={i === passo ? undefined : "hidden"}>
          {secao}
        </div>
      ))}

      <div
        className={cn(
          "flex items-center justify-between gap-3 border-t border-border pt-3",
          // No modal o rodapé fica colado embaixo: as tabelas das métricas são
          // longas, e "Próximo" no fim do conteúdo obrigaria a rolar a cada
          // passo. Os negativos cancelam o p-6 do corpo do modal.
          onConcluir && "sticky bottom-0 -mx-6 -mb-6 bg-surface px-6 pb-5 pt-3",
        )}
      >
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void ir(passo - 1)}
          disabled={passo === 0 || indo}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Anterior
        </Button>
        {!onConcluir && (
          <span className="text-xs text-muted">
            Passo {passo + 1} de {PASSOS.length}
          </span>
        )}
        {ultimo && onConcluir ? (
          <Button size="sm" onClick={() => void concluir()} disabled={indo}>
            {indo && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Salvar
          </Button>
        ) : (
          <Button size="sm" onClick={() => void ir(passo + 1)} disabled={ultimo || indo}>
            {indo && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Próximo
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}
