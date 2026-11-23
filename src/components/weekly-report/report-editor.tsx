"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { excluirRelatorio } from "@/lib/weekly-report/actions";
import { formatarData } from "@/lib/weekly-report/labels";
import type { WeeklyReportDetail } from "@/types/weekly-report";
import { PendenciasProvider, useSalvarPendencias } from "./pendencias";
import { ReportSteps } from "./report-steps";

/**
 * O relatório de uma semana aberto a partir do card — os seis blocos da
 * planilha, um por vez, para ler e editar.
 *
 * Não existe enviar nem aprovar. O ciclo "rascunho → enviado → aprovado" saiu
 * em 24/11/2026: a semana se preenche e se salva, e a reunião lê o que está
 * salvo.
 *
 * "Salvar" aqui grava todo bloco que tem algo pendente. Cada bloco também tem
 * o seu — uma sexta interrompida no meio das métricas não pode perder as
 * entregas já respondidas.
 */
export function ReportEditor({
  slug,
  detail,
  onBack,
}: {
  slug: string;
  detail: WeeklyReportDetail;
  onBack: () => void;
}) {
  const router = useRouter();
  const [excluindo, setExcluindo] = useState(false);
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function remover() {
    if (excluindo) return;
    setExcluindo(true);
    setErro(null);
    const r = await excluirRelatorio({ slug, reportId: detail.id });
    setExcluindo(false);
    if (!r.ok) {
      setErro(r.error ?? "Não foi possível excluir o relatório.");
      return;
    }
    setConfirmarExclusao(false);
    router.refresh();
    onBack();
  }

  return (
    <PendenciasProvider>
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Button variant="ghost" size="sm" onClick={onBack} className="-ml-3 mb-1">
              <ArrowLeft className="h-3.5 w-3.5" />
              Todas as semanas
            </Button>
            <h2 className="text-lg font-semibold text-foreground">Semana {detail.weekNumber}</h2>
            <p className="text-xs text-muted">
              {formatarData(detail.periodStart)} a {formatarData(detail.periodEnd)}
              {detail.authorName && ` · ${detail.authorName}`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {detail.canEdit && <SalvarTudo />}
            {detail.canApprove && (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Excluir relatório"
                className="text-danger"
                onClick={() => setConfirmarExclusao(true)}
                disabled={excluindo}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {erro && <p className="text-xs text-danger">{erro}</p>}

        <ReportSteps slug={slug} detail={detail} />

        <Modal
          open={confirmarExclusao}
          onClose={() => {
            if (!excluindo) setConfirmarExclusao(false);
          }}
          title="Excluir relatório"
          description="A semana e tudo que foi respondido nela são removidos."
          className="max-w-md"
          footer={
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => setConfirmarExclusao(false)}
                disabled={excluindo}
              >
                Cancelar
              </Button>
              <Button variant="danger" onClick={remover} disabled={excluindo}>
                {excluindo && <Loader2 className="h-4 w-4 animate-spin" />}
                Excluir
              </Button>
            </div>
          }
        >
          <p className="p-6 text-sm text-muted">
            Confirma a exclusão da{" "}
            <span className="font-semibold text-foreground">semana {detail.weekNumber}</span>? As
            entregas, as métricas, os OKRs, os bloqueios e a pauta vão com ela. Esta ação não pode
            ser desfeita.
          </p>
        </Modal>
      </div>
    </PendenciasProvider>
  );
}

/** O "Salvar" do cabeçalho: grava todo bloco que tem algo pendente. */
function SalvarTudo() {
  const salvarPendencias = useSalvarPendencias();
  const [estado, setEstado] = useState<"parado" | "salvando" | "salvo">("parado");

  return (
    <div className="flex items-center gap-2">
      {estado === "salvo" && (
        <span className="flex items-center gap-1 text-xs text-primary">
          <Check className="h-3.5 w-3.5" />
          Salvo
        </span>
      )}
      <Button
        onClick={async () => {
          if (estado === "salvando") return;
          setEstado("salvando");
          const ok = await salvarPendencias();
          // O erro quem mostra é o bloco que recusou, em vermelho, ao lado do
          // campo — e não uma linha genérica aqui em cima.
          setEstado(ok ? "salvo" : "parado");
        }}
        disabled={estado === "salvando"}
      >
        {estado === "salvando" && <Loader2 className="h-4 w-4 animate-spin" />}
        Salvar
      </Button>
    </div>
  );
}
