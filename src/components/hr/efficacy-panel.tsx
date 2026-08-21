"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BarChart3, Loader2, Plus, Users, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/providers/toast-provider";
import { createEfficacyRound } from "@/lib/efficacy-actions";
import { fetchEfficacyConsolidated } from "@/lib/efficacy-results-actions";
import type {
  EfficacyRoundRow,
  EfficacyConsolidated,
  EvaluationSubject,
} from "@/types/evaluation";

export interface EfficacyPanelProps {
  rounds: readonly EfficacyRoundRow[];
  /** Colaboradores avaliáveis (sujeito da rodada). */
  subjects: readonly EvaluationSubject[];
  /** Pessoas selecionáveis como avaliadores. */
  raters: readonly { id: string; name: string; sector: string }[];
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

export function EfficacyPanel({ rounds, subjects, raters }: EfficacyPanelProps) {
  const [creating, setCreating] = useState(false);
  const [detail, setDetail] = useState<EfficacyConsolidated | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Avaliação de Eficácia (360°)</h3>
          <p className="text-xs text-muted">
            Abra uma rodada, defina quantos avaliam e designe os avaliadores. A autoavaliação é
            liberada ao colaborador quando o feedback fecha.
          </p>
        </div>
        <Button size="sm" onClick={() => setCreating(true)} disabled={subjects.length === 0}>
          <Plus className="h-4 w-4" /> Nova rodada
        </Button>
      </div>

      {rounds.length === 0 ? (
        <EmptyState
          icon={<Users className="h-5 w-5" />}
          title="Nenhuma rodada aberta"
          description="Crie uma rodada de Eficácia para um colaborador e designe os avaliadores."
        />
      ) : (
        <div className="space-y-2">
          {rounds.map((r) => (
            <RoundRow key={r.id} round={r} onView={setDetail} />
          ))}
        </div>
      )}

      {creating && (
        <CreateRoundModal
          subjects={subjects}
          raters={raters}
          onClose={() => setCreating(false)}
        />
      )}

      {detail && <ConsolidatedModal data={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

function RoundRow({
  round,
  onView,
}: {
  round: EfficacyRoundRow;
  onView: (d: EfficacyConsolidated) => void;
}) {
  const [loading, startLoad] = useTransition();
  const { error } = useToast();

  function view() {
    startLoad(async () => {
      const res = await fetchEfficacyConsolidated(round.id);
      if (res.ok && res.data) onView(res.data);
      else error(res.error ?? "Não foi possível abrir a consolidação.");
    });
  }

  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-surface p-4">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-foreground">{round.subjectName}</p>
        <p className="text-xs text-muted">
          {round.sector} · Feedback {round.feedbackDone}/{round.raterQuota}
          {round.selfDone ? " · autoavaliação ✓" : ""}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <Badge tone={STATUS_TONE[round.status]}>{STATUS_LABEL[round.status]}</Badge>
        <Button size="sm" variant="ghost" onClick={view} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <BarChart3 className="h-4 w-4" />}
          Consolidação
        </Button>
      </div>
    </div>
  );
}

function CreateRoundModal({
  subjects,
  raters,
  onClose,
}: {
  subjects: readonly EvaluationSubject[];
  raters: readonly { id: string; name: string; sector: string }[];
  onClose: () => void;
}) {
  const router = useRouter();
  const { success, error } = useToast();
  const [subjectId, setSubjectId] = useState("");
  const [quota, setQuota] = useState(2);
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, startSave] = useTransition();

  // Avaliadores disponíveis = todos menos o próprio avaliado.
  const available = useMemo(
    () => raters.filter((r) => r.id !== subjectId),
    [raters, subjectId],
  );

  function toggle(id: string) {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= quota) return prev; // respeita a quota
      return [...prev, id];
    });
  }

  function changeQuota(next: number) {
    setQuota(next);
    setSelected((prev) => prev.slice(0, next));
  }

  function save() {
    if (!subjectId) {
      error("Escolha o colaborador avaliado.");
      return;
    }
    if (selected.length !== quota) {
      error(`Designe exatamente ${quota} avaliador(es).`);
      return;
    }
    startSave(async () => {
      const res = await createEfficacyRound({ subjectId, raterQuota: quota, raterIds: selected });
      if (res.ok) {
        success("Rodada aberta. Avaliadores notificados.");
        onClose();
        router.refresh();
      } else {
        error(res.error ?? "Não foi possível abrir a rodada.");
      }
    });
  }

  return (
    <Modal open onClose={() => !saving && onClose()} className="max-w-2xl" dismissible={!saving}>
      <div className="flex max-h-[88vh] flex-col">
        <header className="flex items-start justify-between gap-4 border-b border-border p-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted">Eficácia 360°</p>
            <h2 className="mt-1 text-xl font-bold text-foreground">Nova rodada de avaliação</h2>
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
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">
              Colaborador avaliado
            </label>
            <select
              value={subjectId}
              onChange={(e) => {
                setSubjectId(e.target.value);
                setSelected((prev) => prev.filter((x) => x !== e.target.value));
              }}
              className="focus-ring w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
            >
              <option value="">Selecione…</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.sector}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">
              Quantidade de avaliadores
            </label>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => changeQuota(n)}
                  className={
                    "focus-ring h-10 w-10 rounded-lg border-2 text-sm font-bold transition-all " +
                    (quota === n
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-surface text-muted hover:border-primary/50")
                  }
                >
                  {n}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-muted">
              Padrão: 2 avaliadores + 1 autoavaliação do próprio colaborador.
            </p>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-sm font-medium text-foreground">Designar avaliadores</label>
              <span className="text-xs text-muted">
                {selected.length}/{quota} selecionados
              </span>
            </div>
            <div className="scrollbar-slim max-h-64 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
              {available.length === 0 ? (
                <p className="p-3 text-sm text-muted">Escolha primeiro o colaborador avaliado.</p>
              ) : (
                available.map((r) => {
                  const on = selected.includes(r.id);
                  const disabled = !on && selected.length >= quota;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => toggle(r.id)}
                      disabled={disabled}
                      className={
                        "focus-ring flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors " +
                        (on
                          ? "bg-primary/10 text-foreground"
                          : disabled
                            ? "cursor-not-allowed text-muted/50"
                            : "text-foreground hover:bg-surface-2")
                      }
                    >
                      <span className="min-w-0 truncate">
                        {r.name} <span className="text-muted">· {r.sector}</span>
                      </span>
                      <span
                        className={
                          "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 " +
                          (on ? "border-primary bg-primary text-primary-foreground" : "border-border")
                        }
                      >
                        {on ? "✓" : ""}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>

        <footer className="flex items-center justify-end gap-3 border-t border-border p-5">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={saving || !subjectId || selected.length !== quota}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? "Abrindo" : "Abrir rodada"}
          </Button>
        </footer>
      </div>
    </Modal>
  );
}

function ConsolidatedModal({
  data,
  onClose,
}: {
  data: EfficacyConsolidated;
  onClose: () => void;
}) {
  return (
    <Modal open onClose={onClose} className="max-w-5xl">
      <div className="flex max-h-[92vh] flex-col">
        <header className="flex items-start justify-between gap-4 border-b border-border p-6">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted">
              {data.subjectName} · {data.sector}
            </p>
            <h2 className="mt-1 text-xl font-bold text-foreground">{data.typeTitle}</h2>
            <p className="mt-1 text-xs text-muted">
              {data.raterCount}/{data.raterQuota} avaliadores · autoavaliação{" "}
              {data.hasSelf ? "recebida" : "pendente"}
            </p>
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

        <div className="scrollbar-slim flex-1 overflow-auto p-6">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b-2 border-border text-left">
                <th className="px-3 py-2 font-bold text-foreground">Competências</th>
                {data.competencies[0]?.raterScores.map((_, i) => (
                  <th key={i} className="px-2 py-2 text-center font-semibold text-muted">
                    Pessoa {i + 1}
                  </th>
                ))}
                <th className="px-2 py-2 text-center font-bold text-primary">Média Feedback</th>
                <th className="px-2 py-2 text-center font-bold text-accent">Autoavaliação</th>
              </tr>
            </thead>
            <tbody>
              {data.competencies.map((c, idx) => (
                <tr
                  key={c.label}
                  className={"border-b border-border " + (idx % 2 === 0 ? "" : "bg-surface-2/40")}
                >
                  <td className="px-3 py-2 text-foreground">{c.label}</td>
                  {c.raterScores.map((v, i) => (
                    <td key={i} className="px-2 py-2 text-center font-mono text-muted">
                      {v ?? "—"}
                    </td>
                  ))}
                  <td className="px-2 py-2 text-center font-mono font-semibold text-primary">
                    {c.feedbackAvg ?? "—"}
                  </td>
                  <td className="px-2 py-2 text-center font-mono font-semibold text-accent">
                    {c.selfScore ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border">
                <td className="px-3 py-2.5 font-bold text-foreground">MÉDIA GERAL</td>
                {data.competencies[0]?.raterScores.map((_, i) => (
                  <td key={i} className="px-2 py-2.5" />
                ))}
                <td className="px-2 py-2.5 text-center font-mono font-bold text-primary">
                  {data.overallFeedback ?? "—"}
                </td>
                <td className="px-2 py-2.5 text-center font-mono font-bold text-accent">
                  {data.overallSelf ?? "—"}
                </td>
              </tr>
            </tfoot>
          </table>
          <p className="mt-4 text-xs text-muted">
            Escala 1 a {data.scaleMax}. As colunas por avaliador são anônimas — a identidade de quem
            avaliou não é exibida.
          </p>
        </div>
      </div>
    </Modal>
  );
}
