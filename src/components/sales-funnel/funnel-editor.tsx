"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { arquivarFunil, excluirFunil, salvarFunil } from "@/lib/sales-funnel/actions";
import { calcularAscendente, calcularDescendente, distribuirCanais } from "@/lib/sales-funnel/math";
import type { Equipe, FunnelInput } from "@/lib/sales-funnel/types";
import type { SalesFunnelDetail, SalesFunnelStatus } from "@/types/sales-funnel";
import { MoneyInput } from "./money-input";
import { StageRow, type EtapaEditavel } from "./stage-row";
import { FunnelResultPanel } from "./funnel-result";
import { CanvasBlock, FieldLabel } from "./canvas-block";
import { ChannelsSection, type CanalEditavel } from "./channels-section";
import { ScenariosSection } from "./scenarios-section";
import { Glossary } from "./glossary";

type Modo = "meta" | "capacidade";

/**
 * Chave de linha: o id do banco para quem já foi salvo.
 *
 * Era um contador no escopo do MÓDULO, que incrementava a cada render — no
 * servidor e de novo no cliente, e compartilhado por qualquer editor montado
 * na mesma página. Como chave de React aquilo não chegava a quebrar nada,
 * mas também não identificava linha nenhuma: a mesma etapa trocava de chave
 * a cada remontagem. O id do banco identifica de verdade, e é o que permite
 * usar a chave como alvo de diagnóstico e como atributo do DOM.
 *
 * Linha nova ainda não tem id, e recebe uma chave do contador POR INSTÂNCIA
 * do editor — ver `proximaChave`.
 */
function paraEditavel(detail: SalesFunnelDetail): EtapaEditavel[] {
  return detail.stages.map((s) => ({
    key: s.id,
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
    key: c.id,
    label: c.label,
    strategy: c.strategy ?? "",
    share: String(c.share),
  }));
}

/**
 * O editor de um funil: o formulário em cima, o resultado embaixo.
 *
 * Os quatro blocos numerados do canvas ficam numa faixa de duas colunas
 * (①+② à esquerda, ③+④ à direita), e o funil ocupa a largura inteira
 * abaixo dela. A versão anterior punha o desenho numa coluna central, entre
 * dois montes de formulário: o funil ficava estreito e os campos ficavam
 * espremidos em 320px, cortando "Oportunidades" no meio. Separar as duas
 * coisas dá largura às duas.
 *
 * O funil só aparece depois que os números fecham — quem decide isso é
 * `FunnelResultPanel`, a partir dos diagnósticos do motor.
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
  const [vendedores, setVendedores] = useState(
    detail.sellerCount ? String(detail.sellerCount) : "",
  );
  const [diasUteis, setDiasUteis] = useState(
    detail.workingDays ? String(detail.workingDays) : "",
  );
  /**
   * Chave das linhas criadas nesta sessão de edição, que ainda não têm id de
   * banco. Em `useRef` e não no módulo: o contador é desta instância do
   * editor, não do processo, e só avança em evento — nunca durante o render,
   * que é o que fazia o antigo divergir entre servidor e cliente.
   */
  const proximaChave = useRef(0);
  const novaChave = () => `nova-${(proximaChave.current += 1)}`;

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

  /**
   * Equipe declarada, ou null. Os dois campos andam juntos: com vendedores mas
   * sem dias úteis não há atividade diária a cobrar, e meio plano de ação na
   * tela seria pior que nenhum.
   */
  const equipe: Equipe | null = useMemo(() => {
    const v = Number.parseInt(vendedores, 10);
    const d = Number.parseInt(diasUteis, 10);
    if (!Number.isInteger(v) || !Number.isInteger(d) || v <= 0 || d <= 0) return null;
    return { vendedores: v, diasUteis: d };
  }, [vendedores, diasUteis]);

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

  /**
   * Erro de fatia por canal, para o bloco ③ mostrar na própria linha.
   *
   * O `targetId` do diagnóstico é a chave da linha: `input.channels` é montado
   * aqui com `id: c.key`.
   */
  const errosDeCanal = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const d of resultado.diagnostics) {
      if (d.code === "FATIA_INVALIDA" && d.targetId) mapa.set(d.targetId, d.message);
    }
    return mapa;
  }, [resultado.diagnostics]);

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

    // Uma chamada só, de propósito. Eram três em sequência, e a do meio
    // apaga as etapas — levando junto as taxas de cenário, pela cascata. Uma
    // falha depois dela destruía trabalho em nome de um salvamento que não
    // chegava ao fim.
    const r = await salvarFunil(detail.id, {
      slug,
      name,
      referenceDate,
      goalCents,
      ticketCents,
      // null apaga a equipe declarada, que é o que "esvaziei o campo" quer
      // dizer. Mandar undefined deixaria o valor antigo no banco.
      sellerCount: equipe?.vendedores ?? null,
      workingDays: equipe?.diasUteis ?? null,
      stages: etapas.map((e) => ({
        label: e.label.trim(),
        rate: Number(e.rate.replace(",", ".")),
        transitionRule: e.transitionRule.trim() || undefined,
      })),
      channels: canais.map((c) => ({
        label: c.label.trim(),
        strategy: c.strategy.trim() || undefined,
        share: Number(c.share.replace(",", ".")),
      })),
    });

    setSalvando(false);
    if (!r.ok) {
      setErro(r.error ?? "Não foi possível salvar.");
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
        O formulário, em duas colunas a partir de 1024px. A numeração do
        impresso sobe da esquerda para a direita: ① e ② definem a meta e o
        caminho, ③ e ④ distribuem e testam o que sai deles. Abaixo de 1024px
        vira uma coluna e a ordem passa a ser ①②③④, de cima para baixo.
      */}
      <div className="grid gap-3 lg:grid-cols-2 lg:items-start">
        <div className="space-y-3">
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

              {/* Vendedores e dias úteis: é o que transforma volume do
                  período em atividade cobrável do vendedor. Opcionais — sem
                  eles o funil calcula igual, só não tem plano de ação. */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <FieldLabel htmlFor="ed-vendedores">Vendedores</FieldLabel>
                  <Input
                    id="ed-vendedores"
                    inputMode="numeric"
                    value={vendedores}
                    placeholder="4"
                    disabled={!canManage}
                    className="h-8 text-sm tabular-nums"
                    onChange={(e) => setVendedores(e.target.value.replace(/\D/g, ""))}
                  />
                </div>
                <div className="space-y-1">
                  <FieldLabel htmlFor="ed-dias">Dias úteis</FieldLabel>
                  <Input
                    id="ed-dias"
                    inputMode="numeric"
                    value={diasUteis}
                    placeholder="22"
                    disabled={!canManage}
                    className="h-8 text-sm tabular-nums"
                    onChange={(e) => setDiasUteis(e.target.value.replace(/\D/g, ""))}
                  />
                </div>
              </div>

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

              {/* O número do resultado NÃO mora mais aqui: ele desceu para a
                  faixa do funil, ao lado do desenho que o explica. Repeti-lo
                  em dois lugares faria a tela ter duas respostas para a mesma
                  pergunta, e a de cima estaria longe do que a justifica. */}
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

        {/* ③ Canais e ④ Simulações: o que se distribui e o que se testa,
            depois de a meta e as etapas estarem de pé. */}
        <div className="space-y-3">
          <ChannelsSection
            canais={canais}
            volumes={resultado.channels}
            cobertura={resultado.channelCoverage}
            erros={errosDeCanal}
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
            equipe={equipe}
            canManage={canManage}
          />

          <Glossary />
        </div>
      </div>

      {/* O resultado, embaixo e na largura inteira: é o que a ferramenta
          existe para dar, e até aqui ele disputava espaço com os campos que o
          alimentam. Aparece só quando os números fecham; enquanto isso, lista
          o que falta preencher. */}
      <FunnelResultPanel resultado={resultado} modo={modo} equipe={equipe} />
    </div>
  );
}

