"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { criarRelatorio } from "@/lib/weekly-report/actions";
import { segundaDaSemana, semanaIso, somarDias } from "@/lib/weekly-report/math";
import { formatarData } from "@/lib/weekly-report/labels";
import type { WeeklyReportDetail } from "@/types/weekly-report";
import { PendenciasProvider } from "./pendencias";
import { ReportSteps } from "./report-steps";

/** Segunda a sexta da semana corrente — a janela da rotina da planilha. */
function semanaCorrente() {
  const hoje = new Date().toISOString().slice(0, 10);
  const segunda = segundaDaSemana(hoje);
  return {
    weekNumber: semanaIso(segunda),
    periodStart: segunda,
    periodEnd: somarDias(segunda, 4),
  };
}

/**
 * A semana nova, preenchida em etapas dentro do modal.
 *
 * Primeira página: quando é a semana. Os três campos vêm derivados da data de
 * hoje — na planilha, "Semana nº" e "Período" eram digitados, e a semana 46
 * com o período da 45 era o erro mais comum do arquivo. Seguem editáveis:
 * relatório atrasado se preenche com o período dele, não com o de hoje.
 *
 * Criar a semana é o que dá um lugar no banco para os blocos seguintes
 * gravarem — daí a página 1 existir separada e vir antes. As outras seis são
 * os blocos do relatório, e cada "Próximo" grava o bloco que está à vista.
 *
 * Ao concluir, o modal fecha e a semana fica no card da lista, para ler e
 * editar quando a reunião pedir.
 */
export function NewReportModal({
  slug,
  open,
  onClose,
}: {
  slug: string;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const inicial = semanaCorrente();
  const [weekNumber, setWeekNumber] = useState(String(inicial.weekNumber));
  const [periodStart, setPeriodStart] = useState(inicial.periodStart);
  const [periodEnd, setPeriodEnd] = useState(inicial.periodEnd);
  const [erro, setErro] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);
  /** A semana já criada. É o que os blocos editam, e vem da própria action. */
  const [detail, setDetail] = useState<WeeklyReportDetail | null>(null);

  /** Mover o início arrasta o fim: a janela é de uma semana de trabalho. */
  function trocarInicio(valor: string) {
    setPeriodStart(valor);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return;
    setPeriodEnd(somarDias(valor, 4));
    setWeekNumber(String(semanaIso(valor)));
  }

  async function criar() {
    if (criando) return;
    setCriando(true);
    setErro(null);
    const r = await criarRelatorio({
      slug,
      weekNumber: Number(weekNumber),
      periodStart,
      periodEnd,
    });
    setCriando(false);
    if (!r.ok || !r.detail) {
      setErro(r.error ?? "Não foi possível criar o relatório.");
      return;
    }
    setDetail(r.detail);
    router.refresh();
  }

  function fechar() {
    if (criando) return;
    // A semana já está gravada quando se chega aos blocos; o refresh é o que
    // faz o card dela aparecer na lista atrás do modal.
    if (detail) router.refresh();
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={fechar}
      title={detail ? `Semana ${detail.weekNumber}` : "Nova semana"}
      description={
        detail
          ? `${formatarData(detail.periodStart)} a ${formatarData(detail.periodEnd)} · cada passo grava ao avançar`
          : "Primeiro quando é a semana. Depois os seis blocos do relatório, um por página."
      }
      className={detail ? "max-w-5xl" : "max-w-lg"}
      footer={
        detail ? undefined : (
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose} disabled={criando}>
              Cancelar
            </Button>
            <Button onClick={criar} disabled={criando}>
              {criando && <Loader2 className="h-4 w-4 animate-spin" />}
              Próximo
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        )
      }
    >
      {detail ? (
        <div className="p-6">
          <PendenciasProvider>
            <ReportSteps slug={slug} detail={detail} onConcluir={fechar} />
          </PendenciasProvider>
        </div>
      ) : (
        <div className="space-y-4 p-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="semana-numero">Semana nº</Label>
              <Input
                id="semana-numero"
                inputMode="numeric"
                value={weekNumber}
                onChange={(e) => setWeekNumber(e.target.value.replace(/\D/g, ""))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="semana-inicio">De</Label>
              <Input
                id="semana-inicio"
                type="date"
                value={periodStart}
                onChange={(e) => trocarInicio(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="semana-fim">Até</Label>
              <Input
                id="semana-fim"
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
              />
            </div>
          </div>
          {erro && <p className="text-xs text-danger">{erro}</p>}
        </div>
      )}
    </Modal>
  );
}
