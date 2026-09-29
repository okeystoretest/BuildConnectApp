"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { atualizarFunil, salvarCanais, salvarEtapas } from "@/lib/sales-funnel/actions";
import { calcularAscendente, calcularDescendente, distribuirCanais } from "@/lib/sales-funnel/math";
import { formatarPercentual, formatarReais, formatarVolume } from "@/lib/sales-funnel/format";
import type { FunnelInput } from "@/lib/sales-funnel/types";
import type { SalesFunnelDetail } from "@/types/sales-funnel";
import { MoneyInput } from "./money-input";
import { StageRow, type EtapaEditavel } from "./stage-row";
import { FunnelShape } from "./funnel-shape";
import { DiagnosticsList } from "./diagnostics-list";
import { ChannelsSection, type CanalEditavel } from "./channels-section";
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
 * O editor de um funil.
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

  const destaque =
    modo === "meta"
      ? `Precisaria de ${formatarVolume(resultado.requiredConversions)} conversões`
      : `Renderia ${formatarReais(resultado.projectedRevenueCents)}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" onClick={onBack}>
          ← Voltar para a lista
        </Button>
        {canManage && (
          <Button onClick={salvar} disabled={salvando}>
            {salvando ? "Salvando…" : "Salvar"}
          </Button>
        )}
      </div>

      {!canManage && (
        <p className="rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-muted">
          Você pode mexer nos números para simular. Só Gestor ou Admin salva alterações no funil.
        </p>
      )}

      {erro && <p className="text-sm text-danger">{erro}</p>}

      {/* 1 · Definição da meta */}
      <section className="space-y-3 rounded-lg border border-border bg-surface-1 p-4">
        <h3 className="font-semibold">1 · Meta</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <label htmlFor="ed-nome" className="text-sm font-medium">
              Funil
            </label>
            <Input
              id="ed-nome"
              value={name}
              maxLength={80}
              disabled={!canManage}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="ed-data" className="text-sm font-medium">
              Período
            </label>
            <Input
              id="ed-data"
              type="date"
              value={referenceDate}
              disabled={!canManage}
              onChange={(e) => setReferenceDate(e.target.value)}
            />
          </div>
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
        </div>

        <Segmented
          options={[
            { value: "meta", label: "Meta → Prospecções" },
            { value: "capacidade", label: "Capacidade → Faturamento" },
          ]}
          value={modo}
          onChange={setModo}
          ariaLabel="Sentido do cálculo"
        />

        {modo === "capacidade" && (
          <div className="w-56 space-y-1">
            <label htmlFor="ed-capacidade" className="text-sm font-medium">
              Prospecções no período
            </label>
            <Input
              id="ed-capacidade"
              inputMode="numeric"
              value={capacidade}
              placeholder="600"
              onChange={(e) => setCapacidade(e.target.value)}
            />
          </div>
        )}

        <p className="text-3xl font-bold">{destaque}</p>
        <DiagnosticsList diagnostics={resultado.diagnostics} />
      </section>

      {/* 2 e 3 · Etapas, taxas e regras de transição */}
      <section className="space-y-3 rounded-lg border border-border bg-surface-1 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">2 · Etapas e taxas</h3>
          {canManage && (
            <Button
              variant="secondary"
              size="sm"
              disabled={etapas.length >= 6}
              onClick={() =>
                setEtapas((a) => [
                  ...a,
                  { key: novaChave(), label: "", rate: "50", transitionRule: "" },
                ])
              }
            >
              Acrescentar etapa
            </Button>
          )}
        </div>

        {temCenarioComTaxa && canManage && (
          <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
            Este funil tem cenário com taxa própria. Salvar uma mudança nas etapas recria a lista, e
            as taxas de cenário que apontavam para elas são perdidas.
          </p>
        )}

        <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
          <div className="space-y-2">
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

          <div className="flex flex-col items-center gap-2 lg:w-[340px]">
            <FunnelShape stages={resultado.stages} />
            {resultado.topVolume > 0 && (
              <p className="text-center text-sm text-muted">
                Taxa externa: {formatarPercentual(resultado.externalRate)} —{" "}
                {formatarVolume(resultado.requiredConversions)} de{" "}
                {formatarVolume(resultado.topVolume)}
              </p>
            )}
          </div>
        </div>
      </section>

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

      <Glossary />
    </div>
  );
}
