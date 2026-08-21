"use client";

import { useMemo, useState, useTransition } from "react";
import { CalendarClock, ChevronDown, ClipboardList, Play } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/providers/toast-provider";
import { EvaluationFormModal } from "./evaluation-form-modal";
import { resolveAvailableCycle } from "@/lib/evaluation-actions";
import type {
  EvaluationTypeCard,
  PendingEvaluation,
  SubjectCycles,
  EvalForm,
  EvaluationSubject,
} from "@/types/evaluation";

export interface EvaluationsPanelProps {
  types: readonly EvaluationTypeCard[];
  pending: readonly PendingEvaluation[];
  subjects: readonly SubjectCycles[];
  roster: readonly EvaluationSubject[];
  preEfetivoForm: EvalForm | null;
  /** Formulários das avaliações avulsas, por slug. */
  forms: Record<string, EvalForm>;
}

const PRE_EFETIVO_SLUG = "acompanhamento-pre-efetivo";

interface ActiveForm {
  form: EvalForm;
  subjectId: string;
  subjectName: string;
  cycle?: number;
}

export function EvaluationsPanel({
  types,
  pending,
  subjects,
  roster,
  preEfetivoForm,
  forms,
}: EvaluationsPanelProps) {
  const { error } = useToast();
  const [typeSlug, setTypeSlug] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [active, setActive] = useState<ActiveForm | null>(null);
  const [starting, startTransition] = useTransition();

  const typeOptions = useMemo(
    () => types.map((t) => ({ value: t.slug, label: t.title })),
    [types],
  );
  const subjectOptions = useMemo(
    () => roster.map((r) => ({ value: r.id, label: `${r.name} · ${r.sector}` })),
    [roster],
  );

  const selectedSubject = roster.find((r) => r.id === subjectId);
  const canStart = Boolean(typeSlug && subjectId) && !starting;

  function handleStart() {
    if (!typeSlug || !subjectId || !selectedSubject) return;

    // Pré-Efetivo: resolve o ciclo disponível (respeita 7/14/21 dias úteis).
    if (typeSlug === PRE_EFETIVO_SLUG) {
      if (!preEfetivoForm) {
        error("Formulário do Pré-Efetivo indisponível.");
        return;
      }
      startTransition(async () => {
        const res = await resolveAvailableCycle(subjectId);
        if (!res.ok || !res.cycle) {
          error(res.reason ?? "Nenhum ciclo disponível para este colaborador.");
          return;
        }
        setActive({
          form: preEfetivoForm,
          subjectId,
          subjectName: selectedSubject.name,
          cycle: res.cycle,
        });
      });
      return;
    }

    // Avaliações avulsas: escolha livre, sem ciclo.
    const form = forms[typeSlug];
    if (!form) {
      error("Este instrumento ainda não tem formulário configurado.");
      return;
    }
    if (form.sections.length === 0) {
      error("Este instrumento ainda não tem perguntas cadastradas.");
      return;
    }
    setActive({ form, subjectId, subjectName: selectedSubject.name });
  }

  function handleSubmitted() {
    setActive(null);
    setTypeSlug("");
    setSubjectId("");
  }

  return (
    <div className="space-y-8">
      {/* Seletor: escolher avaliação + colaborador e iniciar */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Play className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Nova avaliação</h3>
        </div>

        {roster.length === 0 ? (
          <EmptyState
            title="Nenhum colaborador para avaliar"
            description="Não há colaboradores lotados neste setor para avaliação."
          />
        ) : (
          <div className="rounded-xl border border-border bg-surface p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="eval-type" className="mb-1.5 block text-xs font-medium text-foreground">
                  Avaliação
                </label>
                <NativeSelect
                  id="eval-type"
                  placeholder="Selecione a avaliação"
                  value={typeSlug}
                  onChange={setTypeSlug}
                  options={typeOptions}
                />
              </div>
              <div>
                <label htmlFor="eval-subject" className="mb-1.5 block text-xs font-medium text-foreground">
                  Colaborador
                </label>
                <NativeSelect
                  id="eval-subject"
                  placeholder="Selecione o colaborador"
                  value={subjectId}
                  onChange={setSubjectId}
                  options={subjectOptions}
                />
              </div>
            </div>

            {typeSlug === PRE_EFETIVO_SLUG && (
              <p className="mt-3 text-[11px] text-muted">
                O Acompanhamento Pré-Efetivo segue o ciclo de 7/14/21 dias úteis — o sistema abre o
                ciclo disponível do colaborador. As demais avaliações são livres.
              </p>
            )}

            <div className="mt-4 flex justify-end">
              <Button onClick={handleStart} disabled={!canStart}>
                <Play className="h-4 w-4" />
                {starting ? "Verificando" : "Iniciar avaliação"}
              </Button>
            </div>
          </div>
        )}
      </section>

      {/* Aviso: ciclos do Pré-Efetivo disponíveis */}
      {pending.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">
              Ciclos Pré-Efetivo disponíveis
            </h3>
            <Badge tone="info">{pending.length}</Badge>
          </div>
          <div className="space-y-2">
            {pending.map((item) => (
              <div
                key={`${item.subjectId}-${item.typeId}-${item.cycle}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">
                    {item.subjectName}
                    <span className="ml-2 text-xs font-normal text-muted">{item.sector}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    Ciclo {item.cycle} · disponível desde {item.availableAtLabel}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!preEfetivoForm}
                  onClick={() =>
                    preEfetivoForm &&
                    setActive({
                      form: preEfetivoForm,
                      subjectId: item.subjectId,
                      subjectName: item.subjectName,
                      cycle: item.cycle,
                    })
                  }
                >
                  Preencher
                </Button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Agenda de ciclos por colaborador (aviso) */}
      {subjects.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">
              Agenda Pré-Efetivo por colaborador
            </h3>
          </div>
          <div className="space-y-2">
            {subjects.map((s) => (
              <div key={s.subjectId} className="rounded-xl border border-border bg-surface p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{s.subjectName}</p>
                    <p className="text-xs text-muted">
                      {s.sector} · admitido em {s.admittedAtLabel}
                    </p>
                  </div>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  {s.cycles.map((c) => (
                    <div
                      key={c.cycle}
                      className={
                        "rounded-lg border p-3 " +
                        (c.status === "DISPONIVEL"
                          ? "border-info/40 bg-info/5"
                          : "border-border bg-surface-2")
                      }
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-foreground">
                          Ciclo {c.cycle}
                        </span>
                        <Badge
                          tone={
                            c.status === "CONCLUIDO"
                              ? "accent"
                              : c.status === "DISPONIVEL"
                                ? "info"
                                : "neutral"
                          }
                        >
                          {c.status === "CONCLUIDO"
                            ? "Concluído"
                            : c.status === "DISPONIVEL"
                              ? "Disponível"
                              : "Agendado"}
                        </Badge>
                      </div>
                      <p className="mt-1.5 text-[11px] text-muted">
                        {c.status === "CONCLUIDO" && c.completedAt
                          ? `Concluído em ${fmt(c.completedAt)}`
                          : `${c.status === "DISPONIVEL" ? "Disponível" : "Previsto"} para ${fmt(c.availableAt)}`}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {active && (
        <EvaluationFormModal
          open={active !== null}
          onClose={() => setActive(null)}
          form={active.form}
          subjectId={active.subjectId}
          subjectName={active.subjectName}
          cycle={active.cycle}
          onSubmitted={handleSubmitted}
        />
      )}
    </div>
  );
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** Select nativo com pares value/label (o Select compartilhado só aceita strings iguais). */
function NativeSelect({
  id,
  placeholder,
  value,
  onChange,
  options,
}: {
  id: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly { value: string; label: string }[];
}) {
  const empty = value === "";
  return (
    <div className="relative">
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={
          "focus-ring h-11 w-full appearance-none rounded-xl border border-border bg-surface-2 pl-3 pr-9 text-sm transition-colors hover:border-border-strong " +
          (empty ? "text-muted" : "text-foreground")
        }
      >
        <option value="" disabled>
          {placeholder}
        </option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
    </div>
  );
}
