"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { salvarResumo } from "@/lib/weekly-report/actions";
import type { WeeklyReportDetail } from "@/types/weekly-report";
import { SectionCard } from "./section-card";
import { useRegistrarPendencia } from "./pendencias";

/** Passo 1 — Resumo da Semana (a aba 1 da planilha). */
export function ResumoSection({
  slug,
  detail,
}: {
  slug: string;
  detail: WeeklyReportDetail;
}) {
  const router = useRouter();
  const [weekNumber, setWeekNumber] = useState(String(detail.weekNumber));
  const [periodStart, setPeriodStart] = useState(detail.periodStart);
  const [periodEnd, setPeriodEnd] = useState(detail.periodEnd);
  const [highlight, setHighlight] = useState(detail.highlight ?? "");
  const [learning, setLearning] = useState(detail.learning ?? "");
  const [nextPriority, setNextPriority] = useState(detail.nextPriority ?? "");
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  /**
   * O que está gravado, para dizer se há algo a gravar.
   *
   * Estado, e não as props: dentro do modal da semana nova o `detail` é o que
   * a criação devolveu e não muda mais, então comparar com ele deixaria o
   * "Salvar" aceso para sempre — e o "Próximo" regravaria o bloco a cada
   * passo.
   */
  const [base, setBase] = useState(() => ({
    weekNumber: String(detail.weekNumber),
    periodStart: detail.periodStart,
    periodEnd: detail.periodEnd,
    highlight: detail.highlight ?? "",
    learning: detail.learning ?? "",
    nextPriority: detail.nextPriority ?? "",
  }));

  const sujo =
    weekNumber !== base.weekNumber ||
    periodStart !== base.periodStart ||
    periodEnd !== base.periodEnd ||
    highlight !== base.highlight ||
    learning !== base.learning ||
    nextPriority !== base.nextPriority;

  async function salvar() {
    if (salvando) return false;
    setSalvando(true);
    setErro(null);
    const r = await salvarResumo({
      slug,
      reportId: detail.id,
      weekNumber: Number(weekNumber),
      periodStart,
      periodEnd,
      highlight: highlight || null,
      learning: learning || null,
      nextPriority: nextPriority || null,
    });
    setSalvando(false);
    if (!r.ok) {
      setErro(r.error ?? "Não foi possível salvar o resumo.");
      return false;
    }
    setBase({ weekNumber, periodStart, periodEnd, highlight, learning, nextPriority });
    setSalvo(true);
    router.refresh();
    return true;
  }

  useRegistrarPendencia(sujo, salvar);

  return (
    <SectionCard
      title="Resumo da semana"
      description="O que a reunião de sexta lê primeiro. Três respostas curtas valem mais do que a planilha inteira."
      canEdit={detail.canEdit}
      onSave={salvar}
      sujo={sujo}
      salvando={salvando}
      salvo={salvo}
      erro={erro}
    >
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="resumo-semana">Semana nº</Label>
            <Input
              id="resumo-semana"
              inputMode="numeric"
              disabled={!detail.canEdit}
              value={weekNumber}
              onChange={(e) => {
                setSalvo(false);
                setWeekNumber(e.target.value.replace(/\D/g, ""));
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="resumo-de">De</Label>
            <Input
              id="resumo-de"
              type="date"
              disabled={!detail.canEdit}
              value={periodStart}
              onChange={(e) => {
                setSalvo(false);
                setPeriodStart(e.target.value);
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="resumo-ate">Até</Label>
            <Input
              id="resumo-ate"
              type="date"
              disabled={!detail.canEdit}
              value={periodEnd}
              onChange={(e) => {
                setSalvo(false);
                setPeriodEnd(e.target.value);
              }}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="resumo-destaque">Destaque da semana (o que funcionou e por quê)</Label>
          <Textarea
            id="resumo-destaque"
            rows={2}
            disabled={!detail.canEdit}
            value={highlight}
            onChange={(e) => {
              setSalvo(false);
              setHighlight(e.target.value);
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="resumo-aprendizado">Principal aprendizado</Label>
          <Textarea
            id="resumo-aprendizado"
            rows={2}
            disabled={!detail.canEdit}
            value={learning}
            onChange={(e) => {
              setSalvo(false);
              setLearning(e.target.value);
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="resumo-prioridade">Prioridade nº 1 da próxima semana</Label>
          <Textarea
            id="resumo-prioridade"
            rows={2}
            disabled={!detail.canEdit}
            value={nextPriority}
            onChange={(e) => {
              setSalvo(false);
              setNextPriority(e.target.value);
            }}
          />
        </div>
      </div>
    </SectionCard>
  );
}
