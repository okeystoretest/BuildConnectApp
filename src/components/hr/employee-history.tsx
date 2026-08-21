"use client";

import { useState, useTransition } from "react";
import * as Icons from "lucide-react";
import { ChevronDown, Loader2, Search } from "lucide-react";
import { cn, initials } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import { DonutChart } from "@/components/ui/donut-chart";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { fetchEmployeeHistory } from "@/lib/hr-actions-history";
import type { EmployeeHistory as History, EmployeeSummary } from "@/types/hr";

function Icon({ name, className }: { name: string; className?: string }) {
  const Cmp = (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[name];
  return Cmp ? <Cmp className={className} /> : null;
}

const TONE_TEXT = { primary: "text-primary", info: "text-info", accent: "text-accent" } as const;
const TONE_BG = { primary: "bg-primary/15", info: "bg-info/15", accent: "bg-accent/15" } as const;

/** Cartão de indicador de engajamento. */
function EngagementCard({
  icon,
  tone,
  value,
  total,
  label,
  hint,
}: {
  icon: string;
  tone: "primary" | "info" | "accent";
  value: number;
  total?: number;
  label: string;
  hint?: string;
}) {
  return (
    <article className="rounded-xl border border-border bg-surface p-5">
      <span
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-lg",
          TONE_BG[tone],
          TONE_TEXT[tone],
        )}
      >
        <Icon name={icon} className="h-4 w-4" />
      </span>
      <p className="mt-3 text-3xl font-bold tracking-tight text-foreground">
        {value}
        {typeof total === "number" && (
          <span className="text-base font-medium text-muted"> / {total}</span>
        )}
      </p>
      <p className="mt-0.5 text-sm text-foreground">{label}</p>
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </article>
  );
}

export interface EmployeeHistoryPanelProps {
  roster: readonly EmployeeSummary[];
  initial: History | null;
}

/**
 * Histórico do Colaborador (RH), focado em ENGAJAMENTO e com dados reais.
 *
 * A busca inicia vazia e sem seleção prévia; ao escolher um colaborador, o
 * histórico é carregado via Server Action. Exibe progresso geral (donut +
 * breakdown), indicadores de engajamento (vídeos assistidos, documentos e
 * instruções lidos, feedbacks recebidos) e um detalhamento de pendências
 * agrupado por tipo de mídia (modal). Chamados foram removidos deste módulo.
 */
export function EmployeeHistoryPanel({ roster, initial }: EmployeeHistoryPanelProps) {
  const [query, setQuery] = useState("");
  const [history, setHistory] = useState<History | null>(initial);
  const [selectedId, setSelectedId] = useState<string | null>(initial?.id ?? null);
  const [pendingModal, setPendingModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const filtered = query.trim()
    ? roster.filter(
        (e) =>
          e.name.toLowerCase().includes(query.trim().toLowerCase()) ||
          e.username.toLowerCase().includes(query.trim().toLowerCase()),
      )
    : roster;

  function select(id: string) {
    if (id === selectedId) return;
    setSelectedId(id);
    setError(null);
    startTransition(async () => {
      const res = await fetchEmployeeHistory({ userId: id });
      if (res.ok && res.history) setHistory(res.history);
      else setError(res.error ?? "Não foi possível carregar o histórico.");
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
      {/* Coluna de seleção */}
      <aside className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nome ou usuário"
            aria-label="Buscar colaborador"
            className="focus-ring h-10 w-full rounded-lg border border-border bg-surface-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted/70 transition-colors hover:border-border-strong"
          />
        </div>

        <div className="scrollbar-slim max-h-[calc(100vh-18rem)] space-y-1.5 overflow-y-auto pr-0.5">
          {filtered.map((emp) => (
            <button
              key={emp.id}
              type="button"
              onClick={() => select(emp.id)}
              aria-current={emp.id === selectedId}
              className={cn(
                "focus-ring flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors",
                emp.id === selectedId
                  ? "border-primary/50 bg-primary/[0.06]"
                  : "border-border bg-surface hover:border-border-strong hover:bg-surface-2",
              )}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/20 text-[10px] font-semibold text-accent">
                {initials(emp.name)}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-foreground">{emp.name}</span>
                <span className="block truncate text-[11px] text-muted">
                  {emp.role} · {emp.sector}
                </span>
              </span>
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="py-8 text-center text-xs text-muted">Nenhum colaborador encontrado.</p>
          )}
        </div>
      </aside>

      {/* Detalhe */}
      <div className="min-w-0">
        {error && (
          <p className="mb-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        {!history && !isPending && (
          <div className="rounded-xl border border-dashed border-border py-16 text-center text-sm text-muted">
            Selecione um colaborador para ver o histórico.
          </div>
        )}

        {isPending && (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-border bg-surface py-16 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando histórico…
          </div>
        )}

        {history && !isPending && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-xl border border-border bg-surface p-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                {initials(history.name)}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{history.name}</p>
                <p className="truncate text-xs text-muted">
                  {history.role} · {history.sector}
                </p>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
              <section className="rounded-xl border border-border bg-surface p-5">
                <h3 className="mb-4 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-muted">
                  <Icon name="Gauge" className="h-3 w-3" />
                  Progresso geral
                </h3>
                <DonutChart
                  value={history.overallPercent}
                  caption={`${history.doneItems} de ${history.totalItems} conteúdos`}
                />
              </section>

              <section className="space-y-4 rounded-xl border border-border bg-surface p-5">
                {history.breakdown.map((item) => {
                  const percent = item.total > 0 ? Math.round((item.done / item.total) * 100) : 0;
                  return (
                    <div key={item.label}>
                      <div className="mb-1.5 flex items-center gap-2">
                        <span
                          className={cn(
                            "flex h-6 w-6 items-center justify-center rounded-md",
                            TONE_BG[item.tone],
                            TONE_TEXT[item.tone],
                          )}
                        >
                          <Icon name={item.icon} className="h-3.5 w-3.5" />
                        </span>
                        <span className="flex-1 text-sm text-foreground">{item.label}</span>
                        <span className="text-xs text-muted">
                          {item.done}/{item.total}
                        </span>
                        <span
                          className={cn("w-10 text-right text-xs font-semibold", TONE_TEXT[item.tone])}
                        >
                          {percent}%
                        </span>
                      </div>
                      <Progress
                        value={percent}
                        tone={item.tone === "info" ? "info" : "primary"}
                        label={item.label}
                      />
                    </div>
                  );
                })}
              </section>
            </div>

            {/* Indicadores de engajamento */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <EngagementCard
                icon="PlayCircle"
                tone="primary"
                value={history.videosWatched}
                total={history.breakdown[0]?.total}
                label="Vídeos assistidos"
              />
              <EngagementCard
                icon="FileText"
                tone="info"
                value={history.documentsRead}
                total={history.breakdown[1]?.total}
                label="Documentos lidos"
              />
              <EngagementCard
                icon="MessageSquareHeart"
                tone="primary"
                value={history.feedbacksReceived}
                label="Feedbacks recebidos"
                hint="em breve"
              />
            </div>

            {/* Conteúdos pendentes — detalhamento por tipo em modal */}
            <section className="rounded-xl border border-border bg-surface p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-warning/15 text-warning">
                    <Icon name="CircleAlert" className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-3xl font-bold leading-none tracking-tight text-warning">
                      {history.pendingItems}
                    </p>
                    <p className="mt-1 text-sm text-foreground">Conteúdos pendentes</p>
                  </div>
                </div>
                {history.pendingItems > 0 && (
                  <Button variant="secondary" size="sm" onClick={() => setPendingModal(true)}>
                    Ver detalhes
                    <ChevronDown className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
              {history.pendingItems === 0 && (
                <p className="mt-3 text-xs text-muted">
                  Nenhuma pendência — todo o conteúdo obrigatório foi concluído.
                </p>
              )}
            </section>
          </div>
        )}
      </div>

      {/* Modal de pendências detalhadas, agrupadas por tipo de mídia */}
      {history && (
        <Modal
          open={pendingModal}
          onClose={() => setPendingModal(false)}
          title="Conteúdos pendentes"
          description={`${history.name} · ${history.pendingItems} item(ns) a concluir`}
          className="max-w-lg"
          footer={
            <div className="flex justify-end">
              <Button variant="secondary" onClick={() => setPendingModal(false)}>
                Fechar
              </Button>
            </div>
          }
        >
          <div className="scrollbar-slim max-h-[60vh] space-y-5 overflow-y-auto p-6">
            {history.pendingGroups.length === 0 ? (
              <p className="text-sm text-muted">Nenhuma pendência.</p>
            ) : (
              history.pendingGroups.map((group) => (
                <div key={group.label}>
                  <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold text-foreground">
                    <span
                      className={cn(
                        "flex h-6 w-6 items-center justify-center rounded-md",
                        TONE_BG[group.tone],
                        TONE_TEXT[group.tone],
                      )}
                    >
                      <Icon name={group.icon} className="h-3.5 w-3.5" />
                    </span>
                    {group.label}
                    <span className="text-muted">({group.items.length})</span>
                  </h4>
                  <ul className="space-y-1.5 pl-8">
                    {group.items.map((item) => (
                      <li
                        key={item.id}
                        className="flex items-start gap-2 text-sm text-foreground"
                      >
                        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted" />
                        <span className="min-w-0 break-words">{item.title}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
