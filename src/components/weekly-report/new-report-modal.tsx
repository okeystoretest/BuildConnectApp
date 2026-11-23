"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { criarRelatorio } from "@/lib/weekly-report/actions";
import { segundaDaSemana, semanaIso, somarDias } from "@/lib/weekly-report/math";

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
 * Abre a semana.
 *
 * Os três campos vêm preenchidos e derivados da data de hoje: na planilha,
 * "Semana nº" e "Período" eram digitados, e a semana 46 com o período da 45
 * era o erro mais comum do arquivo. Seguem editáveis — relatório atrasado se
 * preenche com o período dele, não com o de hoje.
 */
export function NewReportModal({
  slug,
  open,
  onClose,
  onCreated,
}: {
  slug: string;
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const router = useRouter();
  const inicial = semanaCorrente();
  const [weekNumber, setWeekNumber] = useState(String(inicial.weekNumber));
  const [periodStart, setPeriodStart] = useState(inicial.periodStart);
  const [periodEnd, setPeriodEnd] = useState(inicial.periodEnd);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  /** Mover o início arrasta o fim: a janela é de uma semana de trabalho. */
  function trocarInicio(valor: string) {
    setPeriodStart(valor);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return;
    setPeriodEnd(somarDias(valor, 4));
    setWeekNumber(String(semanaIso(valor)));
  }

  async function confirmar() {
    if (salvando) return;
    setSalvando(true);
    setErro(null);
    const r = await criarRelatorio({
      slug,
      weekNumber: Number(weekNumber),
      periodStart,
      periodEnd,
    });
    setSalvando(false);
    if (!r.ok || !r.id) {
      setErro(r.error ?? "Não foi possível criar o relatório.");
      return;
    }
    router.refresh();
    onCreated(r.id);
  }

  return (
    <Modal
      open={open}
      onClose={salvando ? undefined : onClose}
      title="Nova semana"
      description="O relatório nasce com as entregas, as métricas, os OKRs e a pauta já montados."
      className="max-w-lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={salvando}>
            Cancelar
          </Button>
          <Button onClick={confirmar} disabled={salvando}>
            {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
            Criar
          </Button>
        </div>
      }
    >
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
    </Modal>
  );
}
