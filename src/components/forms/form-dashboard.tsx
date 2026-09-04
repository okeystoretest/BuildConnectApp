"use client";

import { useMemo, useState } from "react";
import { EyeOff, History, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { StatCard } from "@/components/ui/stat-card";
import { AnswerBars } from "./answer-bars";
import { ANONYMITY_FLOOR, showsAggregate } from "@/lib/forms/rules";
import { FORM_STATUS_LABEL } from "@/types/form";
import type { FormResults } from "@/lib/forms/data";
import type { QuestionResult } from "@/lib/forms/aggregate";

export interface FormDashboardProps {
  data: FormResults;
  /** Troca a rodada exibida. Ausente = sem navegação entre rodadas. */
  onSelectRound?: (round: number) => void;
  /** Buscando outra rodada no servidor. */
  loading?: boolean;
}

/** Barras verticais da escala, na ordem 1→N: aqui a ordem carrega significado. */
function ScaleBars({ scale }: { scale: NonNullable<QuestionResult["scale"]> }) {
  const max = Math.max(1, ...scale.distribution.map((d) => d.count));

  return (
    <div className="flex items-end gap-4">
      <div className="flex flex-1 items-end gap-2" style={{ height: 140 }}>
        {scale.distribution.map((d) => (
          <div key={d.value} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
            <span className="text-xs tabular-nums text-muted">{d.count}</span>
            <div
              className="w-full rounded-t-md bg-accent transition-[height] duration-300"
              style={{ height: `${(d.count / max) * 100}%`, minHeight: d.count > 0 ? 4 : 0 }}
            />
            <span className="text-xs font-medium tabular-nums text-foreground">{d.value}</span>
          </div>
        ))}
      </div>
      <div className="shrink-0 text-right">
        <p className="text-xs text-muted">Média</p>
        <p className="text-3xl font-bold tabular-nums text-foreground">
          {scale.average === null ? "—" : scale.average.toFixed(2)}
        </p>
      </div>
    </div>
  );
}

/** Texto não é gráfico: é lista, e lista longa precisa de busca. */
function TextAnswers({ texts }: { texts: readonly string[] }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return texts;
    return texts.filter((t) => t.toLowerCase().includes(q));
  }, [texts, query]);

  if (texts.length === 0) {
    return <p className="text-sm text-muted">Nenhuma resposta.</p>;
  }

  return (
    <div>
      {texts.length > 5 && (
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar nas respostas"
          aria-label="Buscar nas respostas"
          className="mb-3"
        />
      )}
      <div className="scrollbar-slim max-h-72 space-y-2 overflow-y-auto">
        {filtered.map((text, i) => (
          <p
            key={i}
            className="rounded-lg border border-border bg-surface-2 p-3 text-sm leading-relaxed text-foreground"
          >
            {text}
          </p>
        ))}
        {filtered.length === 0 && <p className="text-sm text-muted">Nada encontrado.</p>}
      </div>
    </div>
  );
}

export function FormDashboard({ data, onSelectRound, loading }: FormDashboardProps) {
  const { form, results, responseCount, assignedCount, pending, round, rounds } = data;
  const isCurrent = round === form.currentRound;
  const rate = assignedCount === 0 ? 0 : Math.round((responseCount / assignedCount) * 100);
  const visible = showsAggregate(form, responseCount);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={form.status === "PUBLICADO" ? "accent" : "neutral"}>
          {FORM_STATUS_LABEL[form.status]}
        </Badge>
        {form.anonymous && (
          <Badge tone="info">
            <EyeOff className="mr-1 h-3 w-3" />
            Anônimo
          </Badge>
        )}
      </div>

      {/* Uma rodada só não é escolha: o seletor apareceria com um botão único.
          Ele surge quando reabrir criou a segunda. */}
      {rounds.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface p-3">
          <span className="mr-1 inline-flex items-center gap-1.5 text-xs font-medium text-muted">
            <History className="h-3.5 w-3.5" />
            Rodada
          </span>
          {rounds.map((r) => {
            const active = r === round;
            return (
              <button
                key={r}
                type="button"
                onClick={() => onSelectRound?.(r)}
                disabled={loading || !onSelectRound}
                aria-pressed={active}
                className={
                  "focus-ring rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-60 " +
                  (active
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border bg-surface-3 text-muted hover:border-border-strong hover:text-foreground")
                }
              >
                {r}
                {r === form.currentRound && " · atual"}
              </button>
            );
          })}
          {!isCurrent && (
            <span className="ml-auto text-xs text-muted">
              Coleta encerrada. &quot;Quem falta&quot; reflete a rodada atual.
            </span>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Respostas" value={responseCount} />
        <StatCard label="Taxa de resposta" value={`${rate}%`} hint={`de ${assignedCount} pessoas`} />
        <StatCard
          label="Faltam responder"
          value={pending.length}
          tone={pending.length > 0 ? "warning" : "foreground"}
        />
        <StatCard label="Situação" value={FORM_STATUS_LABEL[form.status]} />
      </div>

      {!visible ? (
        <div className="rounded-xl border border-border bg-surface p-5">
          <p className="text-sm leading-relaxed text-foreground">
            Poucas respostas para exibir o resultado sem identificar quem respondeu. Os gráficos
            aparecem a partir de {ANONYMITY_FLOOR} respostas.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {results.map((result) => (
            <div key={result.questionId} className="rounded-xl border border-border bg-surface p-5">
              <div className="mb-4 flex items-start justify-between gap-4">
                <p className="text-base font-semibold leading-snug text-foreground">
                  {result.label}
                </p>
                <span className="shrink-0 text-xs text-muted">
                  {result.answered} resposta(s)
                </span>
              </div>

              {result.options && <AnswerBars options={result.options} />}
              {result.scale && <ScaleBars scale={result.scale} />}
              {result.texts && <TextAnswers texts={result.texts} />}
            </div>
          ))}
        </div>
      )}

      {/* Quem falta responder sai da ATRIBUIÇÃO, não da resposta — por isso
          continua funcionando no anônimo, sem contradizer o anonimato. */}
      <div className="rounded-xl border border-border bg-surface p-5">
        <div className="mb-3 flex items-center gap-2">
          <Users className="h-4 w-4 text-muted" />
          <p className="text-sm font-semibold text-foreground">Quem falta responder</p>
        </div>
        {pending.length === 0 ? (
          <p className="text-sm text-muted">Todo mundo já respondeu.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {pending.map((p) => (
              <span
                key={p.id}
                className="rounded-lg border border-border bg-surface-3 px-3 py-1.5 text-xs text-muted"
              >
                {p.name}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
