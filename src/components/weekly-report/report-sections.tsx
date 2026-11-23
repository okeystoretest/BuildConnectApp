"use client";

import { useCallback } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { salvarSecao } from "@/lib/weekly-report/actions";
import { contarEntregas, percentualDaMeta, variacao } from "@/lib/weekly-report/math";
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
 * As seções do relatório — as abas 2, 3, 4 e 6 da planilha.
 *
 * Entregas, métricas e OKRs são LISTAS LIVRES desde 23/11/2026: a semana monta
 * as próprias linhas, e salvar manda a lista como ela ficou. A pauta continua
 * sendo roteiro fixo — ali só a resposta se escreve.
 *
 * Nenhuma delas calcula para gravar: variação, % da meta e os contadores do
 * rodapé saem de `lib/weekly-report/math` na renderização, com os mesmos
 * valores que o servidor usa. É o que mantém a conta num lugar só.
 */

interface SecaoProps {
  slug: string;
  reportId: string;
  canEdit: boolean;
}

/** Cabeçalho de tabela: um `<th>` discreto, repetido em três lugares. */
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

/** A lixeira do fim da linha. Some para quem não edita. */
function RemoverLinha({
  rotulo,
  onClick,
  disabled,
}: {
  rotulo: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={rotulo}
      className="focus-ring flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-danger/15 hover:text-danger"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  );
}

/** O rodapé "Adicionar linha" das três seções livres. */
function AdicionarLinha({ rotulo, onClick }: { rotulo: string; onClick: () => void }) {
  return (
    <Button size="sm" variant="secondary" onClick={onClick}>
      <Plus className="h-3.5 w-3.5" />
      {rotulo}
    </Button>
  );
}

/** A frase do estado vazio, que é um estado normal numa semana recém-criada. */
function SecaoVazia({ texto }: { texto: string }) {
  return <p className="py-2 text-xs text-muted">{texto}</p>;
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
          day: r.day || null,
          block: r.block || null,
          expected: r.expected,
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
      description="O que a semana se comprometeu a entregar. A evidência é o link ou o print."
      canEdit={canEdit}
      onSave={secao.salvar}
      sujo={secao.sujo}
      salvando={secao.salvando}
      salvo={secao.salvo}
      erro={secao.erro}
      footnote={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span className="text-primary">🟢 No ritmo: {contagem.onTrack}</span>
            <span className="text-warning">🟡 Atenção: {contagem.attention}</span>
            <span className="text-danger">🔴 Travado: {contagem.blocked}</span>
            <span className="text-muted">Sem resposta: {contagem.pending}</span>
          </div>
          {canEdit && (
            <AdicionarLinha
              rotulo="Adicionar entrega"
              onClick={() =>
                secao.adicionar({
                  order: secao.rows.length,
                  day: "",
                  block: "",
                  expected: "",
                })
              }
            />
          )}
        </div>
      }
    >
      {secao.rows.length === 0 ? (
        <SecaoVazia texto="Nenhuma entrega registrada. Use “Adicionar entrega” para montar a semana." />
      ) : (
        <div className="scrollbar-slim -mx-4 overflow-x-auto px-4">
          <table className="w-full min-w-[920px] border-collapse">
            <thead>
              <tr className="border-b border-border">
                <Th className="w-[110px]">Dia</Th>
                <Th className="w-[150px]">Bloco</Th>
                <Th className="min-w-[240px]">Entrega prevista</Th>
                <Th className="w-[150px]">Status</Th>
                <Th className="w-[180px]">Evidência</Th>
                <Th className="w-[200px]">Observação</Th>
                {canEdit && <Th className="w-[44px]"><span className="sr-only">Excluir</span></Th>}
              </tr>
            </thead>
            <tbody>
              {secao.rows.map((row, i) => (
                <tr key={row.id} className="border-b border-border/60 last:border-0">
                  <td className="px-2 py-1.5 align-middle">
                    <Input
                      aria-label={`Dia da entrega ${i + 1}`}
                      className="h-9 text-xs"
                      placeholder="Segunda"
                      disabled={!canEdit}
                      value={row.day}
                      onChange={(e) => secao.alterar(row.id, { day: e.target.value })}
                    />
                  </td>
                  <td className="px-2 py-1.5 align-middle">
                    <Input
                      aria-label={`Bloco da entrega ${i + 1}`}
                      className="h-9 text-xs"
                      placeholder="Planejamento"
                      disabled={!canEdit}
                      value={row.block}
                      onChange={(e) => secao.alterar(row.id, { block: e.target.value })}
                    />
                  </td>
                  <td className="px-2 py-1.5 align-middle">
                    <Input
                      aria-label={`Entrega prevista ${i + 1}`}
                      className="h-9 text-xs"
                      placeholder="O que será entregue"
                      disabled={!canEdit}
                      value={row.expected}
                      onChange={(e) => secao.alterar(row.id, { expected: e.target.value })}
                    />
                  </td>
                  <td className="px-2 py-1.5 align-middle">
                    <HealthSelect
                      ariaLabel={`Status da entrega ${i + 1}`}
                      value={row.health}
                      disabled={!canEdit}
                      onChange={(health) => secao.alterar(row.id, { health })}
                    />
                  </td>
                  <td className="px-2 py-1.5 align-middle">
                    <Input
                      aria-label={`Evidência da entrega ${i + 1}`}
                      className="h-9 text-xs"
                      placeholder="link ou print"
                      disabled={!canEdit}
                      value={row.evidence ?? ""}
                      onChange={(e) => secao.alterar(row.id, { evidence: e.target.value })}
                    />
                  </td>
                  <td className="px-2 py-1.5 align-middle">
                    <Input
                      aria-label={`Observação da entrega ${i + 1}`}
                      className="h-9 text-xs"
                      disabled={!canEdit}
                      value={row.note ?? ""}
                      onChange={(e) => secao.alterar(row.id, { note: e.target.value })}
                    />
                  </td>
                  {canEdit && (
                    <td className="px-2 py-1.5 align-middle">
                      <RemoverLinha
                        rotulo={`Excluir entrega ${i + 1}`}
                        onClick={() => secao.remover(row.id)}
                      />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
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
          channel: r.channel,
          metric: r.metric,
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs">
            {semLeitura > 0 ? (
              <span className="text-warning">
                {semLeitura} {semLeitura === 1 ? "métrica preenchida" : "métricas preenchidas"} sem
                leitura. Número sem o porquê não fecha a semana.
              </span>
            ) : (
              <span className="text-muted">
                Regra de ouro: todo número vem com “o porquê” e “o próximo passo”.
              </span>
            )}
          </p>
          {canEdit && (
            <AdicionarLinha
              rotulo="Adicionar métrica"
              onClick={() =>
                secao.adicionar({
                  order: secao.rows.length,
                  channel: "",
                  metric: "",
                })
              }
            />
          )}
        </div>
      }
    >
      {secao.rows.length === 0 ? (
        <SecaoVazia texto="Nenhuma métrica registrada. Use “Adicionar métrica” para escolher o que esta semana mede." />
      ) : (
        <div className="scrollbar-slim -mx-4 overflow-x-auto px-4">
          <table className="w-full min-w-[1000px] border-collapse">
            <thead>
              <tr className="border-b border-border">
                <Th className="w-[170px]">Canal</Th>
                <Th className="min-w-[170px]">Métrica</Th>
                <Th className="w-[100px]">Anterior</Th>
                <Th className="w-[100px]">Atual</Th>
                <Th className="w-[90px]">Variação</Th>
                <Th className="w-[130px]">Meta/Benchmark</Th>
                <Th className="w-[150px]">Status</Th>
                <Th className="w-[200px]">Leitura (o porquê)</Th>
                {canEdit && <Th className="w-[44px]"><span className="sr-only">Excluir</span></Th>}
              </tr>
            </thead>
            <tbody>
              {secao.rows.map((row, i) => {
                const delta = variacao(row.previous, row.current);
                return (
                  <tr key={row.id} className="border-b border-border/60 last:border-0">
                    <td className="px-2 py-1.5 align-middle">
                      <Input
                        aria-label={`Canal da métrica ${i + 1}`}
                        className="h-9 text-xs"
                        placeholder="Instagram"
                        disabled={!canEdit}
                        value={row.channel}
                        onChange={(e) => secao.alterar(row.id, { channel: e.target.value })}
                      />
                    </td>
                    <td className="px-2 py-1.5 align-middle">
                      <Input
                        aria-label={`Nome da métrica ${i + 1}`}
                        className="h-9 text-xs"
                        placeholder="Alcance (contas)"
                        disabled={!canEdit}
                        value={row.metric}
                        onChange={(e) => secao.alterar(row.id, { metric: e.target.value })}
                      />
                    </td>
                    <td className="px-2 py-1.5 align-middle">
                      <Input
                        aria-label={`Métrica ${i + 1}: semana anterior`}
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
                        aria-label={`Métrica ${i + 1}: semana atual`}
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
                        aria-label={`Métrica ${i + 1}: meta`}
                        className="h-9 text-xs"
                        disabled={!canEdit}
                        value={row.target ?? ""}
                        onChange={(e) => secao.alterar(row.id, { target: e.target.value })}
                      />
                    </td>
                    <td className="px-2 py-1.5 align-middle">
                      <HealthSelect
                        ariaLabel={`Métrica ${i + 1}: status`}
                        value={row.health}
                        disabled={!canEdit}
                        onChange={(health) => secao.alterar(row.id, { health })}
                      />
                    </td>
                    <td className="px-2 py-1.5 align-middle">
                      <Input
                        aria-label={`Métrica ${i + 1}: leitura`}
                        className="h-9 text-xs"
                        placeholder="por que esse número"
                        disabled={!canEdit}
                        value={row.reading ?? ""}
                        onChange={(e) => secao.alterar(row.id, { reading: e.target.value })}
                      />
                    </td>
                    {canEdit && (
                      <td className="px-2 py-1.5 align-middle">
                        <RemoverLinha
                          rotulo={`Excluir métrica ${i + 1}`}
                          onClick={() => secao.remover(row.id)}
                        />
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
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
          objective: r.objective || null,
          keyResult: r.keyResult,
          measure: r.measure || null,
          goalLabel: r.goalLabel || null,
          goalValue: r.goalValue ?? null,
          monthlyRead: r.monthlyRead,
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
      description="Apuração semanal. Marcar “leitura mensal” diz que o KR se decide pela média de 4 semanas, nunca por uma semana isolada."
      canEdit={canEdit}
      onSave={secao.salvar}
      sujo={secao.sujo}
      salvando={secao.salvando}
      salvo={secao.salvo}
      erro={secao.erro}
      footnote={
        canEdit ? (
          <AdicionarLinha
            rotulo="Adicionar resultado-chave"
            onClick={() =>
              secao.adicionar({
                order: secao.rows.length,
                objective: "",
                keyResult: "",
                measure: "",
                goalLabel: "",
                monthlyRead: false,
              })
            }
          />
        ) : undefined
      }
    >
      {secao.rows.length === 0 ? (
        <SecaoVazia texto="Nenhum resultado-chave registrado. Use “Adicionar resultado-chave” para definir o que a semana persegue." />
      ) : (
        <div className="space-y-2">
          {secao.rows.map((row, i) => (
            <div
              key={row.id}
              /* A linha de leitura mensal era destacada em amarelo na planilha.
                 Aqui o destaque é discreto e a razão vai na caixa de seleção
                 ao lado — cor sozinha não explica nada a quem não leu a aba de
                 instruções. */
              className={`rounded-lg border border-border p-3 ${
                row.monthlyRead ? "bg-warning/[0.06]" : "bg-surface-2/40"
              }`}
            >
              <div className="grid gap-2 lg:grid-cols-12">
                <div className="lg:col-span-5">
                  <Input
                    aria-label={`Resultado-chave ${i + 1}`}
                    className="h-9 text-xs"
                    placeholder="Resultado-chave"
                    disabled={!canEdit}
                    value={row.keyResult}
                    onChange={(e) => secao.alterar(row.id, { keyResult: e.target.value })}
                  />
                </div>
                <div className="lg:col-span-4">
                  <Input
                    aria-label={`Objetivo do resultado-chave ${i + 1}`}
                    className="h-9 text-xs"
                    placeholder="Objetivo"
                    disabled={!canEdit}
                    value={row.objective}
                    onChange={(e) => secao.alterar(row.id, { objective: e.target.value })}
                  />
                </div>
                <div className="lg:col-span-3 flex items-center justify-between gap-2">
                  <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-muted">
                    <input
                      type="checkbox"
                      className="focus-ring h-3.5 w-3.5 rounded border-border accent-warning"
                      disabled={!canEdit}
                      checked={row.monthlyRead}
                      onChange={(e) =>
                        secao.alterar(row.id, { monthlyRead: e.target.checked })
                      }
                    />
                    leitura mensal
                  </label>
                  {canEdit && (
                    <RemoverLinha
                      rotulo={`Excluir resultado-chave ${i + 1}`}
                      onClick={() => secao.remover(row.id)}
                    />
                  )}
                </div>

                <div className="lg:col-span-4">
                  <Input
                    aria-label={`Como medir o resultado-chave ${i + 1}`}
                    className="h-9 text-xs"
                    placeholder="Como medir"
                    disabled={!canEdit}
                    value={row.measure}
                    onChange={(e) => secao.alterar(row.id, { measure: e.target.value })}
                  />
                </div>
                <div className="lg:col-span-2">
                  <Input
                    aria-label={`Meta do resultado-chave ${i + 1}`}
                    className="h-9 text-xs"
                    placeholder="Meta (texto)"
                    disabled={!canEdit}
                    value={row.goalLabel}
                    onChange={(e) => secao.alterar(row.id, { goalLabel: e.target.value })}
                  />
                </div>
                <div className="lg:col-span-2">
                  <Input
                    aria-label={`Meta em número do resultado-chave ${i + 1}`}
                    className="h-9 text-xs"
                    inputMode="decimal"
                    placeholder="Meta (nº)"
                    disabled={!canEdit}
                    value={escreverNumero(row.goalValue)}
                    onChange={(e) =>
                      secao.alterar(row.id, { goalValue: lerNumero(e.target.value) })
                    }
                  />
                </div>
                <div className="lg:col-span-2">
                  <Input
                    aria-label={`Realizado do resultado-chave ${i + 1}`}
                    className="h-9 text-xs"
                    inputMode="decimal"
                    placeholder="Realizado"
                    disabled={!canEdit}
                    value={escreverNumero(row.achieved)}
                    onChange={(e) =>
                      secao.alterar(row.id, { achieved: lerNumero(e.target.value) })
                    }
                  />
                </div>
                <div className="lg:col-span-2 flex items-center gap-3 px-1 text-[11px]">
                  <span className="text-muted">
                    % meta{" "}
                    <span className="font-semibold text-foreground">
                      {formatarPercentual(percentualDaMeta(row.achieved, row.goalValue))}
                    </span>
                  </span>
                  <span className="text-muted">
                    {/* Vem do servidor: depende dos relatórios anteriores, que
                        a tela não tem. Só atualiza depois de salvar. */}
                    4 sem.{" "}
                    <span className="font-semibold text-foreground">
                      {formatarNumero(row.fourWeekAverage)}
                    </span>
                  </span>
                </div>

                <div className="lg:col-span-3">
                  <HealthSelect
                    ariaLabel={`Status do resultado-chave ${i + 1}`}
                    value={row.health}
                    disabled={!canEdit}
                    onChange={(health) => secao.alterar(row.id, { health })}
                  />
                </div>
                <div className="lg:col-span-9">
                  <Input
                    aria-label={`Próximo passo do resultado-chave ${i + 1}`}
                    className="h-9 text-xs"
                    placeholder="Próximo passo"
                    disabled={!canEdit}
                    value={row.nextStep ?? ""}
                    onChange={(e) => secao.alterar(row.id, { nextStep: e.target.value })}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

// ─────────────────────────────────────────────────────────────
// Aba 6 — Pauta do One-on-One (roteiro fixo: só a resposta se escreve)
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
      description="As perguntas da conversa de sexta. Respondidas antes da reunião, elas viram pauta em vez de improviso."
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
