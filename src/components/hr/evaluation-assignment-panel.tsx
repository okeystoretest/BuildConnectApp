"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ChevronDown, Loader2, Lock, Plus, UserPlus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/providers/toast-provider";
import { assignEvaluation } from "@/lib/evaluation-rounds-actions";
import { MAX_TOTAL_RATERS, MIN_TOTAL_RATERS } from "@/lib/evaluation-rounds-config";
import type {
  AssignableEvaluationType,
  EfficacyRoundRow,
  EvaluationSubject,
} from "@/types/evaluation";

export interface EvaluationAssignmentPanelProps {
  /** Instrumentos que exigem múltiplos avaliadores. */
  types: readonly AssignableEvaluationType[];
  /** Colaboradores que podem ser avaliados. */
  subjects: readonly EvaluationSubject[];
  /** Pessoas selecionáveis como avaliadores. */
  raters: readonly { id: string; name: string; sector: string }[];
  /** Rodadas já atribuídas (andamento e conclusão). */
  rounds: readonly EfficacyRoundRow[];
}

const STATUS_LABEL: Record<EfficacyRoundRow["status"], string> = {
  COLETANDO_FEEDBACK: "Coletando feedback",
  AGUARDANDO_AUTO: "Aguardando autoavaliação",
  CONCLUIDA: "Concluída",
};

const STATUS_TONE: Record<EfficacyRoundRow["status"], "info" | "warning" | "primary"> = {
  COLETANDO_FEEDBACK: "info",
  AGUARDANDO_AUTO: "warning",
  CONCLUIDA: "primary",
};

/**
 * Card "Atribuir Avaliações".
 *
 * Instrumentos multiavaliador (Matriz de Decisão, Eficácia 360°) não são
 * preenchidos por uma pessoa só: o DHO define a quantidade TOTAL de
 * avaliadores, escolhe quem ocupa cada posição e indica o avaliado. A última
 * posição é sempre preenchida automaticamente pelo próprio avaliado
 * (autoavaliação) — ex.: 3 avaliadores ⇒ posições 1 e 2 escolhidas pelo DHO,
 * posição 3 = o colaborador selecionado.
 */
export function EvaluationAssignmentPanel({
  types,
  subjects,
  raters,
  rounds,
}: EvaluationAssignmentPanelProps) {
  const [creating, setCreating] = useState(false);
  const usable = types.filter((t) => t.questionCount > 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Atribuir Avaliações</h3>
          <p className="mt-0.5 max-w-2xl text-xs text-muted">
            Para instrumentos com múltiplos avaliadores. Defina quantos avaliam, escolha cada
            avaliador e o colaborador avaliado — a última posição da sequência é a autoavaliação
            dele, preenchida automaticamente.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => setCreating(true)}
          disabled={usable.length === 0 || subjects.length === 0}
        >
          <Plus className="h-4 w-4" /> Nova atribuição
        </Button>
      </div>

      {types.some((t) => t.questionCount === 0) && (
        <p className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
          Sem perguntas cadastradas:{" "}
          {types
            .filter((t) => t.questionCount === 0)
            .map((t) => t.title)
            .join(", ")}
          . Cadastre o instrumento antes de atribuí-lo.
        </p>
      )}

      {rounds.length === 0 ? (
        <EmptyState
          icon={<UserPlus className="h-5 w-5" />}
          title="Nenhuma avaliação atribuída"
          description="Atribua uma Matriz de Decisão ou uma Eficácia 360° a um colaborador e designe quem vai avaliá-lo."
        />
      ) : (
        <div className="space-y-2">
          {rounds.map((round) => (
            <RoundRow key={round.id} round={round} />
          ))}
        </div>
      )}

      {creating && (
        <AssignModal
          types={usable}
          subjects={subjects}
          raters={raters}
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  );
}

function RoundRow({ round }: { round: EfficacyRoundRow }) {
  const total = round.raterQuota + 1;
  const done = round.feedbackDone + (round.selfDone ? 1 : 0);

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{round.subjectName}</p>
          <p className="mt-0.5 text-xs text-muted">
            {round.typeTitle} · {round.sector} · atribuída em {round.createdAtLabel} às{" "}
            {round.createdAtTimeLabel}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="font-mono text-xs text-muted">
            {done}/{total}
          </span>
          <Badge tone={STATUS_TONE[round.status]}>{STATUS_LABEL[round.status]}</Badge>
        </div>
      </div>

      <ul className="mt-3 flex flex-wrap gap-2">
        {round.raters.map((rater, index) => (
          <li
            key={`${round.id}-${rater.name}-${index}`}
            className={
              "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] " +
              (rater.done
                ? "border-primary/25 bg-primary/10 text-primary"
                : "border-border bg-surface-2 text-muted")
            }
          >
            <span className="font-mono">{index + 1}.</span>
            {rater.name}
            {rater.done && <CheckCircle2 className="h-3 w-3" />}
          </li>
        ))}
        <li
          className={
            "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] " +
            (round.selfDone
              ? "border-accent/30 bg-accent/10 text-accent"
              : "border-dashed border-border bg-surface-2 text-muted")
          }
        >
          <span className="font-mono">{total}.</span>
          {round.subjectName} · autoavaliação
          {round.selfDone && <CheckCircle2 className="h-3 w-3" />}
        </li>
      </ul>
    </div>
  );
}

function AssignModal({
  types,
  subjects,
  raters,
  onClose,
}: {
  types: readonly AssignableEvaluationType[];
  subjects: readonly EvaluationSubject[];
  raters: readonly { id: string; name: string; sector: string }[];
  onClose: () => void;
}) {
  const router = useRouter();
  const { success, error } = useToast();
  const [typeSlug, setTypeSlug] = useState(types[0]?.slug ?? "");
  const [subjectId, setSubjectId] = useState("");
  const [total, setTotal] = useState(3);
  // Uma posição por avaliador de feedback (a última é a autoavaliação).
  const [slots, setSlots] = useState<string[]>(["", ""]);
  const [saving, startSave] = useTransition();

  const subject = subjects.find((s) => s.id === subjectId) ?? null;
  const feedbackSlots = total - 1;

  // Avaliadores disponíveis = todos, menos o avaliado (ele é a última posição).
  const available = useMemo(
    () => raters.filter((r) => r.id !== subjectId),
    [raters, subjectId],
  );

  function changeTotal(next: number) {
    setTotal(next);
    setSlots((prev) => {
      const wanted = next - 1;
      const copy = prev.slice(0, wanted);
      while (copy.length < wanted) copy.push("");
      return copy;
    });
  }

  function changeSubject(id: string) {
    setSubjectId(id);
    // O avaliado não pode ocupar também uma posição de feedback.
    setSlots((prev) => prev.map((value) => (value === id ? "" : value)));
  }

  function changeSlot(index: number, value: string) {
    setSlots((prev) => prev.map((current, i) => (i === index ? value : current)));
  }

  const filled = slots.filter((s) => s !== "").length;
  const ready = Boolean(typeSlug && subjectId) && filled === feedbackSlots;

  function save() {
    if (!ready) return;
    startSave(async () => {
      const res = await assignEvaluation({
        typeSlug,
        subjectId,
        totalRaters: total,
        raterIds: slots,
      });
      if (res.ok) {
        success("Avaliação atribuída. Avaliadores notificados.");
        onClose();
        router.refresh();
      } else {
        error(res.error ?? "Não foi possível atribuir a avaliação.");
      }
    });
  }

  return (
    <Modal open onClose={() => !saving && onClose()} className="max-w-2xl" dismissible={!saving}>
      <div className="flex max-h-[88vh] flex-col">
        <header className="flex items-start justify-between gap-4 border-b border-border p-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted">DHO</p>
            <h2 className="mt-1 text-xl font-bold text-foreground">Atribuir avaliação</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="focus-ring flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface-2 text-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="scrollbar-slim flex-1 space-y-5 overflow-y-auto p-6">
          <Field label="Instrumento" htmlFor="assign-type">
            <NativeSelect
              id="assign-type"
              placeholder="Selecione o instrumento"
              value={typeSlug}
              onChange={setTypeSlug}
              options={types.map((t) => ({ value: t.slug, label: t.title }))}
            />
          </Field>

          <Field label="Colaborador avaliado" htmlFor="assign-subject">
            <NativeSelect
              id="assign-subject"
              placeholder="Selecione o colaborador"
              value={subjectId}
              onChange={changeSubject}
              options={subjects.map((s) => ({ value: s.id, label: `${s.name} · ${s.sector}` }))}
            />
          </Field>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">
              Quantidade de avaliadores
            </label>
            <div className="flex gap-2">
              {Array.from(
                { length: MAX_TOTAL_RATERS - MIN_TOTAL_RATERS + 1 },
                (_, i) => i + MIN_TOTAL_RATERS,
              ).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => changeTotal(n)}
                  className={
                    "focus-ring h-10 w-10 rounded-lg border-2 text-sm font-bold transition-all " +
                    (total === n
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-surface text-muted hover:border-primary/50")
                  }
                >
                  {n}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-muted">
              Total incluindo a autoavaliação: {feedbackSlots} avaliador(es) + o próprio avaliado na
              última posição.
            </p>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-sm font-medium text-foreground">Sequência de avaliadores</label>
              <span className="text-xs text-muted">
                {filled}/{feedbackSlots} definidos
              </span>
            </div>

            <div className="space-y-2">
              {slots.map((value, index) => {
                const taken = new Set(slots.filter((s, i) => s !== "" && i !== index));
                return (
                  <div key={index} className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-2 font-mono text-xs font-bold text-muted">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <NativeSelect
                        id={`assign-slot-${index}`}
                        placeholder={subjectId ? "Selecione o avaliador" : "Escolha antes o avaliado"}
                        value={value}
                        onChange={(next) => changeSlot(index, next)}
                        disabled={!subjectId}
                        options={available
                          .filter((r) => !taken.has(r.id))
                          .map((r) => ({ value: r.id, label: `${r.name} · ${r.sector}` }))}
                      />
                    </div>
                  </div>
                );
              })}

              {/* Última posição: sempre o próprio avaliado (automático). */}
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border-2 border-accent/40 bg-accent/10 font-mono text-xs font-bold text-accent">
                  {total}
                </span>
                <div className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-xl border border-dashed border-accent/40 bg-accent/5 px-3 py-2">
                  <span className="min-w-0 truncate text-sm text-foreground">
                    {subject ? `${subject.name} · ${subject.sector}` : "O colaborador avaliado"}
                  </span>
                  <span className="inline-flex shrink-0 items-center gap-1.5 text-[11px] font-semibold text-accent">
                    <Lock className="h-3 w-3" /> Autoavaliação
                  </span>
                </div>
              </div>
            </div>

            <p className="mt-2 text-xs text-muted">
              A autoavaliação é liberada ao colaborador assim que todos os avaliadores anteriores
              enviarem suas respostas.
            </p>
          </div>
        </div>

        <footer className="flex items-center justify-end gap-3 border-t border-border p-5">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={saving || !ready}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? "Atribuindo" : "Atribuir avaliação"}
          </Button>
        </footer>
      </div>
    </Modal>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}

/** Select nativo com pares value/label. */
function NativeSelect({
  id,
  placeholder,
  value,
  onChange,
  options,
  disabled = false,
}: {
  id: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly { value: string; label: string }[];
  disabled?: boolean;
}) {
  const empty = value === "";
  return (
    <div className="relative">
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={
          "focus-ring h-11 w-full appearance-none rounded-xl border border-border bg-surface-2 pl-3 pr-9 text-sm transition-colors hover:border-border-strong disabled:opacity-50 " +
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
