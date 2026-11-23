"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Loader2, Lock, Send, Trash2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Modal } from "@/components/ui/modal";
import {
  definirStatusRelatorio,
  excluirRelatorio,
  salvarResumo,
} from "@/lib/weekly-report/actions";
import {
  REPORT_STATUS_LABEL,
  REPORT_STATUS_TONE,
  formatarData,
  formatarDataHora,
} from "@/lib/weekly-report/labels";
import type { WeeklyReportDetail } from "@/types/weekly-report";
import { SectionCard } from "./section-card";
import {
  AgendaSection,
  DeliveriesSection,
  MetricsSection,
  OkrsSection,
} from "./report-sections";
import { BlockersSection } from "./blockers-section";

/** Os seis blocos do relatório, na ordem em que se preenchem. */
const PASSOS = [
  { id: "resumo", label: "1 · Resumo" },
  { id: "entregas", label: "2 · Entregas" },
  { id: "metricas", label: "3 · Canais e métricas" },
  { id: "okrs", label: "4 · OKRs" },
  { id: "bloqueios", label: "5 · Bloqueios" },
  { id: "pauta", label: "6 · Pauta" },
] as const;

/**
 * O relatório de uma semana aberto — os seis blocos da planilha, um por vez.
 *
 * Um por vez, e não os seis empilhados, porque a página inteira de uma sexta
 * cansa antes do terceiro bloco: "Próximo" avança, e a barra de cima mostra
 * onde se está e deixa pular direto para qualquer bloco.
 *
 * Os seis ficam MONTADOS; só o do passo atual aparece. Cada bloco guarda o que
 * foi digitado em estado local, e desmontá-lo ao avançar jogaria fora o texto
 * ainda não salvo.
 *
 * Cada seção grava por conta própria. Não existe "Salvar tudo": uma sexta
 * interrompida no meio das métricas não pode perder as entregas já
 * respondidas.
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
  const [acao, setAcao] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);
  const [passo, setPasso] = useState(0);
  const barra = useRef<HTMLDivElement>(null);

  function irPara(indice: number) {
    setPasso(indice);
    // Quem chegou ao fim de uma tabela longa está com a barra de passos fora
    // da tela; sem isto o bloco seguinte abriria acima do campo visível.
    barra.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  async function transicionar(a: "enviar" | "aprovar" | "reabrir") {
    if (acao) return;
    setAcao(a);
    setErro(null);
    const r = await definirStatusRelatorio({ slug, reportId: detail.id, acao: a });
    setAcao(null);
    if (!r.ok) {
      setErro(r.error ?? "Não foi possível concluir a ação.");
      return;
    }
    router.refresh();
  }

  async function remover() {
    if (acao) return;
    setAcao("excluir");
    setErro(null);
    const r = await excluirRelatorio({ slug, reportId: detail.id });
    setAcao(null);
    if (!r.ok) {
      setErro(r.error ?? "Não foi possível excluir o relatório.");
      return;
    }
    setConfirmarExclusao(false);
    router.refresh();
    onBack();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Button variant="ghost" size="sm" onClick={onBack} className="-ml-3 mb-1">
            <ArrowLeft className="h-3.5 w-3.5" />
            Todas as semanas
          </Button>
          <h2 className="flex flex-wrap items-center gap-2 text-lg font-semibold text-foreground">
            Semana {detail.weekNumber}
            <Badge tone={REPORT_STATUS_TONE[detail.status]}>
              {REPORT_STATUS_LABEL[detail.status]}
            </Badge>
          </h2>
          <p className="text-xs text-muted">
            {formatarData(detail.periodStart)} a {formatarData(detail.periodEnd)}
            {/* A data de envio some ao reabrir: o relatório voltou a ser
                rascunho, e "enviado em" ao lado de "Rascunho" fazia a tela
                dizer duas coisas opostas sobre a mesma semana. */}
            {detail.status !== "RASCUNHO" &&
              detail.submittedAt &&
              ` · enviado em ${formatarDataHora(detail.submittedAt)}`}
            {detail.status === "APROVADO" &&
              detail.approverName &&
              ` · aprovado por ${detail.approverName}`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {detail.status === "RASCUNHO" && (
            <Button onClick={() => transicionar("enviar")} disabled={acao !== null}>
              {acao === "enviar" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Enviar
            </Button>
          )}
          {detail.canApprove && detail.status !== "APROVADO" && (
            <Button variant="outline" onClick={() => transicionar("aprovar")} disabled={acao !== null}>
              {acao === "aprovar" && <Loader2 className="h-4 w-4 animate-spin" />}
              Aprovar
            </Button>
          )}
          {detail.canApprove && detail.status !== "RASCUNHO" && (
            <Button
              variant="secondary"
              onClick={() => transicionar("reabrir")}
              disabled={acao !== null}
            >
              {acao === "reabrir" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Undo2 className="h-4 w-4" />
              )}
              Reabrir
            </Button>
          )}
          {detail.canApprove && (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Excluir relatório"
              className="text-danger"
              onClick={() => setConfirmarExclusao(true)}
              disabled={acao !== null}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {erro && <p className="text-xs text-danger">{erro}</p>}

      {!detail.canEdit && (
        <p className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-muted">
          <Lock className="h-3.5 w-3.5 shrink-0" />
          Relatório aprovado. Peça ao gestor para reabri-lo antes de editar.
        </p>
      )}

      <div ref={barra}>
        <Tabs
          items={PASSOS}
          value={PASSOS[passo]!.id}
          onValueChange={(id) => irPara(PASSOS.findIndex((p) => p.id === id))}
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

      <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => irPara(passo - 1)}
          disabled={passo === 0}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Anterior
        </Button>
        <span className="text-xs text-muted">
          Passo {passo + 1} de {PASSOS.length}
        </span>
        <Button
          size="sm"
          onClick={() => irPara(passo + 1)}
          disabled={passo === PASSOS.length - 1}
        >
          Próximo
          <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      </div>

      <Modal
        open={confirmarExclusao}
        onClose={() => {
          if (!acao) setConfirmarExclusao(false);
        }}
        title="Excluir relatório"
        description="A semana e tudo que foi respondido nela são removidos."
        className="max-w-md"
        footer={
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => setConfirmarExclusao(false)}
              disabled={acao !== null}
            >
              Cancelar
            </Button>
            <Button variant="danger" onClick={remover} disabled={acao !== null}>
              {acao === "excluir" && <Loader2 className="h-4 w-4 animate-spin" />}
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
  );
}

/** Aba 1 — Resumo da Semana. */
function ResumoSection({ slug, detail }: { slug: string; detail: WeeklyReportDetail }) {
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

  const sujo =
    weekNumber !== String(detail.weekNumber) ||
    periodStart !== detail.periodStart ||
    periodEnd !== detail.periodEnd ||
    highlight !== (detail.highlight ?? "") ||
    learning !== (detail.learning ?? "") ||
    nextPriority !== (detail.nextPriority ?? "");

  async function salvar() {
    if (salvando) return;
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
      return;
    }
    setSalvo(true);
    router.refresh();
  }

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
