"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import {
  arquivarFunil,
  atualizarFunil,
  excluirFunil,
  salvarCanais,
  salvarEtapas,
} from "@/lib/sales-funnel/actions";
import { calcularAscendente, calcularDescendente, distribuirCanais } from "@/lib/sales-funnel/math";
import { formatarPercentual, formatarReais, formatarVolume } from "@/lib/sales-funnel/format";
import type { FunnelInput } from "@/lib/sales-funnel/types";
import type { SalesFunnelDetail, SalesFunnelStatus } from "@/types/sales-funnel";
import { MoneyInput } from "./money-input";
import { StageRow, type EtapaEditavel } from "./stage-row";
import { FunnelShape } from "./funnel-shape";
import { DiagnosticsList } from "./diagnostics-list";
import { CanvasBlock, FieldLabel } from "./canvas-block";
import { PhaseRail } from "./phase-rail";
import { ChannelsSection, type CanalEditavel } from "./channels-section";
import { ScenariosSection } from "./scenarios-section";
import { Glossary } from "./glossary";

type Modo = "meta" | "capacidade";

/** Chave local estável para uma linha de etapa. */
let seq = 0;
const novaChave = () => `etapa-${(seq += 1)}`;

function paraEditavel(detail: SalesFunnelDetail): EtapaEditavel[] {
  return detail.stages.map((s) => ({
    key: novaChave(),
    label: s.label,
    rate: String(s.rate),
    transitionRule: s.transitionRule ?? "",
  }));
}

/** yyyy-mm-dd para o <input type="date">, a partir do ISO do servidor. */
function paraInputDate(iso: string): string {
  return iso.slice(0, 10);
}

function paraCanalEditavel(detail: SalesFunnelDetail): CanalEditavel[] {
  return detail.channels.map((c) => ({
    key: novaChave(),
    label: c.label,
    strategy: c.strategy ?? "",
    share: String(c.share),
  }));
}

/**
 * O editor de um funil, na disposição do canvas impresso.
 *
 * Três zonas, como a folha deitada: canais e simulações à esquerda, o funil
 * no centro, os blocos numerados de etapas e meta à direita, e o trilho de
 * fases na borda. A versão anterior empilhava cinco seções de largura total,
 * o que gastava os 1800px da aba com um formulário de uma coluna e empurrava
 * o funil — o assunto da ferramenta — para fora da primeira dobra.
 *
 * O cálculo roda AQUI, no cliente, a cada tecla — é o que faz a ferramenta
 * ser uma calculadora e não um formulário. O mesmo motor roda no servidor
 * para os cards da lista; são a mesma função, então os dois números nunca
 * divergem.
 *
 * Salvar é explícito. Um funil é um compromisso da equipe inteira: salvar a
 * cada tecla faria a meta mudar debaixo de quem estivesse olhando a lista.
 */
export function FunnelEditor({
  slug,
  detail,
  canManage,
  onBack,
}: {
  slug: string;
  detail: SalesFunnelDetail;
  canManage: boolean;
  onBack: () => void;
}) {
  const router = useRouter();

  const [name, setName] = useState(detail.name);
  const [referenceDate, setReferenceDate] = useState(() => paraInputDate(detail.referenceDate));
  const [goalCents, setGoalCents] = useState<number | null>(detail.goalCents);
  const [ticketCents, setTicketCents] = useState<number | null>(detail.ticketCents);
  const [etapas, setEtapas] = useState<EtapaEditavel[]>(() => paraEditavel(detail));
  const [canais, setCanais] = useState<CanalEditavel[]>(() => paraCanalEditavel(detail));
  const [modo, setModo] = useState<Modo>("meta");
  const [capacidade, setCapacidade] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);

  const input: FunnelInput = useMemo(
    () => ({
      goalCents: goalCents ?? 0,
      ticketCents: ticketCents ?? 0,
      stages: etapas.map((e) => ({
        id: e.key,
        label: e.label,
        // Vírgula é o separador que a pessoa digita; Number() só entende ponto.
        rate: Number(e.rate.replace(",", ".")),
      })),
      channels: canais.map((c) => ({
        id: c.key,
        label: c.label,
        share: Number(c.share.replace(",", ".")),
      })),
    }),
    [goalCents, ticketCents, etapas, canais],
  );

  const resultado = useMemo(() => {
    const base =
      modo === "meta"
        ? calcularAscendente(input)
        : calcularDescendente(input, Number(capacidade.replace(/\D/g, "")) || 0);
    // Os canais dependem do topo, então entram DEPOIS do funil — e entram nos
    // dois sentidos de cálculo.
    return distribuirCanais(base, input.channels);
  }, [input, modo, capacidade]);

  const volumePorChave = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const s of resultado.stages) mapa.set(s.id, s.volume);
    return mapa;
  }, [resultado.stages]);

  const temCenarioComTaxa = detail.scenarios.some((s) => Object.keys(s.rates).length > 0);

  function mexerNaEtapa(key: string, patch: Partial<EtapaEditavel>) {
    setEtapas((atual) => atual.map((e) => (e.key === key ? { ...e, ...patch } : e)));
  }

  function moverEtapa(key: string, delta: -1 | 1) {
    setEtapas((atual) => {
      const i = atual.findIndex((e) => e.key === key);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= atual.length) return atual;
      const copia = [...atual];
      const a = copia[i];
      const b = copia[j];
      if (!a || !b) return atual;
      copia[i] = b;
      copia[j] = a;
      return copia;
    });
  }

  async function salvar() {
    if (salvando || !canManage) return;
    if (goalCents === null || ticketCents === null) {
      setErro("Preencha a meta e o ticket médio antes de salvar.");
      return;
    }
    setSalvando(true);
    setErro(null);

    const dados = await atualizarFunil(detail.id, {
      slug,
      name,
      referenceDate,
      goalCents,
      ticketCents,
    });
    if (!dados.ok) {
      setSalvando(false);
      setErro(dados.error ?? "Não foi possível salvar.");
      return;
    }

    const stages = await salvarEtapas({
      slug,
      funnelId: detail.id,
      stages: etapas.map((e) => ({
        label: e.label.trim(),
        rate: Number(e.rate.replace(",", ".")),
        transitionRule: e.transitionRule.trim() || undefined,
      })),
    });
    if (!stages.ok) {
      setSalvando(false);
      setErro(stages.error ?? "Não foi possível salvar as etapas.");
      return;
    }

    const channels = await salvarCanais({
      slug,
      funnelId: detail.id,
      channels: canais.map((c) => ({
        label: c.label.trim(),
        strategy: c.strategy.trim() || undefined,
        share: Number(c.share.replace(",", ".")),
      })),
    });
    setSalvando(false);
    if (!channels.ok) {
      setErro(channels.error ?? "Não foi possível salvar os canais.");
      return;
    }
    router.refresh();
  }

  async function trocarSituacao(status: SalesFunnelStatus) {
    if (!canManage || salvando) return;
    setSalvando(true);
    setErro(null);
    const r = await arquivarFunil(slug, detail.id, status);
    setSalvando(false);
    if (!r.ok) {
      setErro(r.error ?? "Não foi possível mudar a situação.");
      return;
    }
    router.refresh();
  }

  async function excluir() {
    if (!canManage || salvando) return;
    setSalvando(true);
    const r = await excluirFunil(slug, detail.id);
    setSalvando(false);
    if (!r.ok) {
      setErro(r.error ?? "Não foi possível excluir.");
      setConfirmandoExclusao(false);
      return;
    }
    // Volta para a lista: o funil que estava aberto não existe mais.
    onBack();
    router.refresh();
  }

  const destaque =
    modo === "meta"
      ? `${formatarVolume(resultado.requiredConversions)} conversões`
      : formatarReais(resultado.projectedRevenueCents);

  return (
    <div className="space-y-3">
      {/* Faixa de identificação: quem é este funil e o que fazer com ele.
          Nome e período saíram do bloco Meta — são identificação, não meta. */}
      <header className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface-1 px-3 py-2">
        <Button variant="ghost" size="sm" onClick={onBack} aria-label="Voltar para a lista">
          ←
        </Button>

        <Input
          aria-label="Nome do funil"
          value={name}
          maxLength={80}
          disabled={!canManage}
          className="h-8 w-44 font-semibold"
          onChange={(e) => setName(e.target.value)}
        />
        <Input
          aria-label="Período do funil"
          type="date"
          value={referenceDate}
          disabled={!canManage}
          className="h-8 w-36 text-sm"
          onChange={(e) => setReferenceDate(e.target.value)}
        />

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {canManage && (
            <>
              {/* Situação num seletor ÚNICO: três botões lado a lado liam-se
                  como três ações, e não como um estado com três valores. */}
              <label htmlFor="ed-situacao" className="sr-only">
                Situação do funil
              </label>
              <Select
                id="ed-situacao"
                className="h-8 w-36 text-sm"
                value={detail.status}
                disabled={salvando}
                options={[
                  { value: "RASCUNHO", label: "Rascunho" },
                  { value: "ATIVO", label: "Ativo" },
                  { value: "ARQUIVADO", label: "Arquivado" },
                ]}
                onChange={(e) => trocarSituacao(e.target.value as SalesFunnelStatus)}
              />

              {/* Ação principal: a única preenchida da faixa. */}
              <Button size="sm" onClick={salvar} disabled={salvando}>
                {salvando ? "Salvando…" : "Salvar"}
              </Button>

              {/* Divisória antes da ação destrutiva: separa o que desfaz do
                  que constrói, para o clique errado não ficar a um pixel do
                  certo. */}
              <span aria-hidden className="mx-0.5 h-6 w-px bg-border" />

              {confirmandoExclusao ? (
                <span className="flex items-center gap-1.5 rounded-md border border-danger/40 bg-danger/15 px-2 py-1">
                  <span className="text-xs font-medium">Excluir para sempre?</span>
                  <Button variant="danger" size="sm" disabled={salvando} onClick={excluir}>
                    Confirmar
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={salvando}
                    onClick={() => setConfirmandoExclusao(false)}
                  >
                    Cancelar
                  </Button>
                </span>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={salvando}
                  onClick={() => setConfirmandoExclusao(true)}
                  className="text-muted hover:bg-danger/15 hover:text-danger"
                >
                  Excluir
                </Button>
              )}
            </>
          )}
        </div>
      </header>

      {!canManage && (
        <p className="rounded-md border border-border bg-surface-2 px-3 py-1.5 text-xs text-muted">
          Você pode mexer nos números para simular. Só Gestor ou Admin salva alterações no funil.
        </p>
      )}

      {erro && <p className="text-sm text-danger">{erro}</p>}

      {/*
        As três zonas da folha. Abaixo de 1280px viram uma coluna, na ordem
        Etapas/Meta → Funil → Canais → Simulações: num monitor estreito o
        número da meta é o que se procura primeiro, e o funil só faz sentido
        depois dele.
      */}
      <div className="grid gap-3 xl:grid-cols-[20rem_minmax(0,1fr)_19rem_auto]">
        {/* ESQUERDA — ① Meta e ② Etapas: o que se define primeiro, onde a
            leitura começa. A numeração sobe da esquerda para a direita, e é
            por isso que esta coluna não é mais a dos canais. */}
        <div className="order-1 space-y-3">
          <CanvasBlock numero={1} titulo="Definição da meta">
            <div className="space-y-2">
              <MoneyInput
                id="ed-meta"
                label="Meta global"
                cents={goalCents}
                disabled={!canManage}
                onChange={setGoalCents}
              />
              <MoneyInput
                id="ed-ticket"
                label="Ticket médio"
                cents={ticketCents}
                disabled={!canManage}
                onChange={setTicketCents}
              />

              <Segmented
                options={[
                  { value: "meta", label: "Meta → Prosp." },
                  { value: "capacidade", label: "Capac. → R$" },
                ]}
                value={modo}
                onChange={setModo}
                ariaLabel="Sentido do cálculo"
              />

              {modo === "capacidade" && (
                <div className="space-y-1">
                  <FieldLabel htmlFor="ed-capacidade">Prospecções no período</FieldLabel>
                  <Input
                    id="ed-capacidade"
                    inputMode="numeric"
                    value={capacidade}
                    placeholder="600"
                    className="h-8 text-sm tabular-nums"
                    onChange={(e) => setCapacidade(e.target.value)}
                  />
                </div>
              )}

              <div className="rounded-md border border-primary/25 bg-primary/5 px-2.5 py-2">
                <FieldLabel>{modo === "meta" ? "Precisaria de" : "Renderia"}</FieldLabel>
                <p className="mt-0.5 text-2xl font-bold leading-tight tabular-nums">{destaque}</p>
              </div>
            </div>
          </CanvasBlock>

          <CanvasBlock
            numero={2}
            titulo="Etapas e taxas"
            acao={
              canManage && (
                <button
                  type="button"
                  disabled={etapas.length >= 6}
                  onClick={() =>
                    setEtapas((a) => [
                      ...a,
                      { key: novaChave(), label: "", rate: "50", transitionRule: "" },
                    ])
                  }
                  className="rounded px-1.5 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/10 disabled:opacity-40"
                >
                  + etapa
                </button>
              )
            }
          >
            {temCenarioComTaxa && canManage && (
              <p className="mb-2 rounded border border-l-4 border-warning/40 border-l-warning bg-warning/15 px-2 py-1.5 text-[11px] text-foreground">
                Há cenário com taxa própria. Salvar mudança nas etapas recria a lista, e essas taxas
                se perdem.
              </p>
            )}
            <div className="space-y-1">
              {etapas.map((etapa, i) => (
                <StageRow
                  key={etapa.key}
                  etapa={etapa}
                  volume={volumePorChave.get(etapa.key) ?? null}
                  posicao={i}
                  total={etapas.length}
                  disabled={!canManage}
                  onChange={(patch) => mexerNaEtapa(etapa.key, patch)}
                  onMove={(delta) => moverEtapa(etapa.key, delta)}
                  onRemove={() => setEtapas((a) => a.filter((e) => e.key !== etapa.key))}
                />
              ))}
            </div>
          </CanvasBlock>
        </div>

        {/* CENTRO: o funil, que é o assunto. */}
        <div className="order-2 flex flex-col items-center rounded-lg border border-border bg-surface-1 p-3">
          {resultado.stages.length > 0 ? (
            <FunnelShape
              stages={resultado.stages}
              channels={resultado.channels}
              conversoes={resultado.requiredConversions}
            />
          ) : (
            <p className="py-16 text-center text-sm text-muted">
              Preencha a meta, o ticket e as taxas para o funil aparecer.
            </p>
          )}

          {resultado.topVolume > 0 && (
            <p className="mt-1 text-center text-[11px] uppercase tracking-[0.12em] text-muted">
              Taxa externa {formatarPercentual(resultado.externalRate)}
            </p>
          )}

          <DiagnosticsList diagnostics={resultado.diagnostics} className="mt-3 w-full" />
        </div>

        {/* DIREITA — ③ Canais e ④ Simulações: o que se distribui e o que se
            testa, depois de a meta e as etapas estarem de pé. */}
        <div className="order-3 space-y-3">
          <ChannelsSection
            canais={canais}
            volumes={resultado.channels}
            cobertura={resultado.channelCoverage}
            disabled={!canManage}
            onChange={(key, patch) =>
              setCanais((atual) => atual.map((c) => (c.key === key ? { ...c, ...patch } : c)))
            }
            onAdd={() =>
              setCanais((a) => [...a, { key: novaChave(), label: "", strategy: "", share: "" }])
            }
            onRemove={(key) => setCanais((a) => a.filter((c) => c.key !== key))}
          />

          <ScenariosSection
            slug={slug}
            funnelId={detail.id}
            plano={input}
            etapasSalvas={detail.stages.map((s) => ({ id: s.id, label: s.label, rate: s.rate }))}
            cenarios={detail.scenarios}
            canManage={canManage}
          />

          <Glossary />
        </div>

        <div className="order-4">
          <PhaseRail />
        </div>
      </div>
    </div>
  );
}

