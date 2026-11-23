"use client";

import { useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { salvarSecao } from "@/lib/weekly-report/actions";
import {
  contarEntregas,
  percentualDaMeta,
  variacao,
} from "@/lib/weekly-report/math";
import {
  formatarNumero,
  formatarPercentual,
  formatarVariacao,
} from "@/lib/weekly-report/labels";
import type {
  AgendaItem,
  DeliveryItem,
  MetricItem,
  OkrItem,
} from "@/types/weekly-report";
import { HealthSelect } from "./health-select";
import { SectionCard } from "./section-card";
import { escreverNumero, lerNumero, useSecao } from "./use-secao";

/**
 * As quatro seções de modelo fixo do relatório — as abas 2, 3, 4 e 6 da
 * planilha.
 *
 * Nenhuma delas calcula para gravar: variação, % da meta e os contadores do
 * rodapé saem de `lib/weekly-report/math` na renderização, com os mesmos
 * valores que o servidor usa. É o que mantém a conta num lugar só.
 *
 * Cada uma edita em memória e grava a seção inteira numa chamada, como se
 * preenchia a aba e se fechava o arquivo.
 */

interface SecaoProps {
  slug: string;
  reportId: string;
  canEdit: boolean;
}

/** Cabeçalho de tabela: um `<th>` discreto, repetido em quatro lugares. */
function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      scope="col"
      className={`whitespace-nowrap px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted ${className ?? ""}`}
    >
      {children}
    </th>
  );
}

// ─────────────────────────────────────────────────────────────
// Aba 2 — Entregas da Semana
// ─────────────────────────────────────────────────────────────

export function DeliveriesSection({
  slug,
  reportId,
  canEdit,
  deliveries,
}: SecaoProps & { deliveries: readonly DeliveryItem[] }) {
  const enviar = useCallback(
    (rows: readonly DeliveryItem[]) =>
      salvarSecao({
        kind: "delivery",
        slug,
        reportId,
        rows: rows.map((r) => ({
          id: r.id,
          health: r.health ?? null,
          evidence: r.evidence ?? null,
          note: r.note ?? null,
        })),
      }),
    [slug, reportId],
  );
  const secao = useSecao(deliveries, enviar);
  const contagem = contarEntregas(secao.rows);

  return (
    <SectionCard
      title="Entregas da semana"
      description="A rotina, dia a dia. Toda entrega precisa de status; a evidência é o link ou o print."
      canEdit={canEdit}
      onSave={secao.salvar}
      sujo={secao.sujo}
      salvando={secao.salvando}
      salvo={secao.salvo}
      erro={secao.erro}
      footnote={
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="text-primary">🟢 No ritmo: {contagem.onTrack}</span>
          <span className="text-warning">🟡 Atenção: {contagem.attention}</span>
          <span className="text-danger">🔴 Travado: {contagem.blocked}</span>
          <span className="text-muted">Sem resposta: {contagem.pending}</span>
        </div>
      }
    >
      <div className="scrollbar-slim -mx-4 overflow-x-auto px-4">
        <table className="w-full min-w-[920px] border-collapse">
          <thead>
            <tr className="border-b border-border">
              <Th>Dia</Th>
              <Th>Bloco</Th>
              <Th className="min-w-[280px]">Entrega prevista</Th>
              <Th className="w-[150px]">Status</Th>
              <Th className="w-[200px]">Evidência</Th>
              <Th className="w-[240px]">Observação</Th>
            </tr>
          </thead>
          <tbody>
            {secao.rows.map((row) => (
              <tr key={row.id} className="border-b border-border/60 last:border-0">
                <td className="px-2 py-1.5 align-middle text-xs text-muted">{row.day}</td>
                <td className="px-2 py-1.5 align-middle text-xs text-muted">{row.block}</td>
                <td className="px-2 py-1.5 align-middle text-xs text-foreground">
                  {row.expected}
                </td>
                <td className="px-2 py-1.5 align-middle">
                  <HealthSelect
                    ariaLabel={`Status de: ${row.expected}`}
                    value={row.health}
                    disabled={!canEdit}
                    onChange={(health) => secao.alterar(row.id, { health })}
                  />
                </td>
                <td className="px-2 py-1.5 align-middle">
                  <Input
                    aria-label={`Evidência de: ${row.expected}`}
                    className="h-9 text-xs"
                    placeholder="link ou print"
                    disabled={!canEdit}
                    value={row.evidence ?? ""}
                    onChange={(e) => secao.alterar(row.id, { evidence: e.target.value })}
                  />
                </td>
                <td className="px-2 py-1.5 align-middle">
                  <Input
                    aria-label={`Observação de: ${row.expected}`}
                    className="h-9 text-xs"
                    disabled={!canEdit}
                    value={row.note ?? ""}
                    onChange={(e) => secao.alterar(row.id, { note: e.target.value })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

// ─────────────────────────────────────────────────────────────
// Aba 3 — Canais e Métricas
// ─────────────────────────────────────────────────────────────

export function MetricsSection({
  slug,
  reportId,
  canEdit,
  metrics,
}: SecaoProps & { metrics: readonly MetricItem[] }) {
  const enviar = useCallback(
    (rows: readonly MetricItem[]) =>
      salvarSecao({
        kind: "metric",
        slug,
        reportId,
        rows: rows.map((r) => ({
          id: r.id,
          previous: r.previous ?? null,
          current: r.current ?? null,
          target: r.target ?? null,
          health: r.health ?? null,
          reading: r.reading ?? null,
        })),
      }),
    [slug, reportId],
  );
  const secao = useSecao(metrics, enviar);

  const semLeitura = secao.rows.filter(
    (r) => r.current !== undefined && !(r.reading ?? "").trim(),
  ).length;

  return (
    <SectionCard
      title="Canais e métricas"
      description="Números reais dos insights das plataformas, sem estimativa. A variação é calculada."
      canEdit={canEdit}
      onSave={secao.salvar}
      sujo={secao.sujo}
      salvando={secao.salvando}
      salvo={secao.salvo}
      erro={secao.erro}
      footnote={
        <p className="text-xs text-muted">
          {semLeitura > 0 ? (
            <span className="text-warning">
              {semLeitura} {semLeitura === 1 ? "métrica preenchida" : "métricas preenchidas"} sem
              leitura. Número sem o porquê não fecha a semana.
            </span>
          ) : (
            "Regra de ouro: todo número vem com “o porquê” e “o próximo passo”."
          )}
        </p>
      }
    >
      <div className="scrollbar-slim -mx-4 overflow-x-auto px-4">
        <table className="w-full min-w-[1000px] border-collapse">
          <thead>
            <tr className="border-b border-border">
              <Th>Canal</Th>
              <Th>Métrica</Th>
              <Th className="w-[110px]">Anterior</Th>
              <Th className="w-[110px]">Atual</Th>
              <Th className="w-[90px]">Variação</Th>
              <Th className="w-[150px]">Meta/Benchmark</Th>
              <Th className="w-[150px]">Status</Th>
              <Th className="w-[260px]">Leitura (o porquê)</Th>
            </tr>
          </thead>
          <tbody>
            {secao.rows.map((row) => {
              const delta = variacao(row.previous, row.current);
              return (
                <tr key={row.id} className="border-b border-border/60 last:border-0">
                  <td className="px-2 py-1.5 align-middle text-xs text-muted">{row.channel}</td>
                  <td className="px-2 py-1.5 align-middle text-xs text-foreground">
                    {row.metric}
                  </td>
                  <td className="px-2 py-1.5 align-middle">
                    <Input
                      aria-label={`${row.metric}: semana anterior`}
                      className="h-9 text-xs"
                      inputMode="decimal"
                      disabled={!canEdit}
                      value={escreverNumero(row.previous)}
                      onChange={(e) =>
                        secao.alterar(row.id, { previous: lerNumero(e.target.value) })
                      }
                    />
                  </td>
                  <td className="px-2 py-1.5 align-middle">
                    <Input
                      aria-label={`${row.metric}: semana atual`}
                      className="h-9 text-xs"
                      inputMode="decimal"
                      disabled={!canEdit}
                      value={escreverNumero(row.current)}
                      onChange={(e) =>
                        secao.alterar(row.id, { current: lerNumero(e.target.value) })
                      }
                    />
                  </td>
                  <td
                    className={`px-2 py-1.5 align-middle text-xs font-semibold ${
                      delta === undefined
                        ? "text-muted"
                        : delta > 0
                          ? "text-primary"
                          : delta < 0
                            ? "text-danger"
                            : "text-muted"
                    }`}
                  >
                    {formatarVariacao(delta)}
                  </td>
                  <td className="px-2 py-1.5 align-middle">
                    <Input
                      aria-label={`${row.metric}: meta`}
                      className="h-9 text-xs"
                      disabled={!canEdit}
                      value={row.target ?? ""}
                      onChange={(e) => secao.alterar(row.id, { target: e.target.value })}
                    />
                  </td>
                  <td className="px-2 py-1.5 align-middle">
                    <HealthSelect
                      ariaLabel={`${row.metric}: status`}
                      value={row.health}
                      disabled={!canEdit}
                      onChange={(health) => secao.alterar(row.id, { health })}
                    />
                  </td>
                  <td className="px-2 py-1.5 align-middle">
                    <Input
                      aria-label={`${row.metric}: leitura`}
                      className="h-9 text-xs"
                      placeholder="por que esse número"
                      disabled={!canEdit}
                      value={row.reading ?? ""}
                      onChange={(e) => secao.alterar(row.id, { reading: e.target.value })}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

// ─────────────────────────────────────────────────────────────
// Aba 4 — OKRs
// ─────────────────────────────────────────────────────────────

export function OkrsSection({
  slug,
  reportId,
  canEdit,
  okrs,
}: SecaoProps & { okrs: readonly OkrItem[] }) {
  const enviar = useCallback(
    (rows: readonly OkrItem[]) =>
      salvarSecao({
        kind: "okr",
        slug,
        reportId,
        rows: rows.map((r) => ({
          id: r.id,
          achieved: r.achieved ?? null,
          health: r.health ?? null,
          nextStep: r.nextStep ?? null,
        })),
      }),
    [slug, reportId],
  );
  const secao = useSecao(okrs, enviar);

  return (
    <SectionCard
      title="OKRs"
      description="Apuração semanal. Os KRs marcados como MENSAL se decidem pela média de 4 semanas, nunca por uma semana isolada."
      canEdit={canEdit}
      onSave={secao.salvar}
      sujo={secao.sujo}
      salvando={secao.salvando}
      salvo={secao.salvo}
      erro={secao.erro}
    >
      <div className="scrollbar-slim -mx-4 overflow-x-auto px-4">
        <table className="w-full min-w-[1040px] border-collapse">
          <thead>
            <tr className="border-b border-border">
              <Th className="min-w-[260px]">Resultado-chave</Th>
              <Th className="w-[130px]">Meta</Th>
              <Th className="w-[110px]">Realizado</Th>
              <Th className="w-[90px]">% da meta</Th>
              <Th className="w-[110px]">Média 4 sem.</Th>
              <Th className="w-[150px]">Status</Th>
              <Th className="w-[240px]">Próximo passo</Th>
            </tr>
          </thead>
          <tbody>
            {secao.rows.map((row) => (
              <tr
                key={row.id}
                /* A linha de leitura mensal era destacada em amarelo na
                   planilha. Aqui o destaque é discreto e a razão vai no selo
                   ao lado do KR — cor sozinha não explica nada a quem não
                   leu a aba de instruções. */
                className={`border-b border-border/60 last:border-0 ${
                  row.monthlyRead ? "bg-warning/[0.06]" : ""
                }`}
              >
                <td className="px-2 py-1.5 align-middle">
                  <p className="text-xs text-foreground">{row.keyResult}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
                    {row.objective}
                    {row.monthlyRead && (
                      <Badge tone="warning" className="text-[10px]">
                        leitura mensal
                      </Badge>
                    )}
                  </p>
                </td>
                <td className="px-2 py-1.5 align-middle text-xs text-muted">{row.goalLabel}</td>
                <td className="px-2 py-1.5 align-middle">
                  <Input
                    aria-label={`${row.keyResult}: realizado na semana`}
                    className="h-9 text-xs"
                    inputMode="decimal"
                    disabled={!canEdit}
                    value={escreverNumero(row.achieved)}
                    onChange={(e) =>
                      secao.alterar(row.id, { achieved: lerNumero(e.target.value) })
                    }
                  />
                </td>
                <td className="px-2 py-1.5 align-middle text-xs font-semibold text-foreground">
                  {formatarPercentual(percentualDaMeta(row.achieved, row.goalValue))}
                </td>
                <td className="px-2 py-1.5 align-middle text-xs text-muted">
                  {/* Vem do servidor: depende dos relatórios anteriores, que a
                      tela não tem. Só atualiza depois de salvar. */}
                  {formatarNumero(row.fourWeekAverage)}
                </td>
                <td className="px-2 py-1.5 align-middle">
                  <HealthSelect
                    ariaLabel={`${row.keyResult}: status`}
                    value={row.health}
                    disabled={!canEdit}
                    onChange={(health) => secao.alterar(row.id, { health })}
                  />
                </td>
                <td className="px-2 py-1.5 align-middle">
                  <Input
                    aria-label={`${row.keyResult}: próximo passo`}
                    className="h-9 text-xs"
                    disabled={!canEdit}
                    value={row.nextStep ?? ""}
                    onChange={(e) => secao.alterar(row.id, { nextStep: e.target.value })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

// ─────────────────────────────────────────────────────────────
// Aba 6 — Pauta do One-on-One
// ─────────────────────────────────────────────────────────────

export function AgendaSection({
  slug,
  reportId,
  canEdit,
  agenda,
}: SecaoProps & { agenda: readonly AgendaItem[] }) {
  const enviar = useCallback(
    (rows: readonly AgendaItem[]) =>
      salvarSecao({
        kind: "agenda",
        slug,
        reportId,
        rows: rows.map((r) => ({ id: r.id, answer: r.answer ?? null })),
      }),
    [slug, reportId],
  );
  const secao = useSecao(agenda, enviar);
  const total = secao.rows.reduce((soma, r) => soma + r.minutes, 0);

  return (
    <SectionCard
      title="Pauta do one-on-one"
      description="As cinco perguntas da conversa de sexta. Respondidas antes da reunião, elas viram pauta em vez de improviso."
      canEdit={canEdit}
      onSave={secao.salvar}
      sujo={secao.sujo}
      salvando={secao.salvando}
      salvo={secao.salvo}
      erro={secao.erro}
      footnote={<p className="text-xs text-muted">{total} minutos no total.</p>}
    >
      <div className="space-y-3">
        {secao.rows.map((row) => (
          <div key={row.id} className="space-y-1.5">
            <p className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-semibold text-foreground">{row.block}</span>
              <Badge className="text-[10px]">{row.minutes} min</Badge>
            </p>
            <p className="text-xs text-muted">{row.question}</p>
            <Textarea
              aria-label={row.question}
              rows={2}
              className="text-xs"
              disabled={!canEdit}
              value={row.answer ?? ""}
              onChange={(e) => secao.alterar(row.id, { answer: e.target.value })}
            />
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
