"use client";

import { useState } from "react";
import { ClipboardList, UserCheck, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { EvaluationFormModal } from "@/components/hr/evaluation-form-modal";
import { submitRoundEvaluation } from "@/lib/evaluation-rounds-actions";
import type { EvalForm, MyEvaluationTask } from "@/types/evaluation";

export interface MyEvaluationsPanelProps {
  tasks: readonly MyEvaluationTask[];
  /** Formulários dos instrumentos de rodada, indexados por slug. */
  forms: Record<string, EvalForm>;
}

interface ActiveTask {
  task: MyEvaluationTask;
  form: EvalForm;
}

/**
 * Aba "Minhas avaliações": lista as avaliações que o usuário precisa preencher.
 *  - FEEDBACK: você foi designado para avaliar outra pessoa.
 *  - AUTOAVALIACAO: as avaliações sobre você fecharam; registre a sua.
 * O usuário responde só o próprio formulário; a consolidação (com o nome de
 * cada avaliador) é vista pelo DHO na aba de Resultados.
 */
export function MyEvaluationsPanel({ tasks, forms }: MyEvaluationsPanelProps) {
  const [active, setActive] = useState<ActiveTask | null>(null);

  function start(task: MyEvaluationTask) {
    const form = forms[task.typeSlug];
    if (!form || form.sections.length === 0) return;
    setActive({ task, form });
  }

  if (tasks.length === 0) {
    return (
      <EmptyState
        icon={<ClipboardList className="h-5 w-5" />}
        title="Nenhuma avaliação pendente"
        description="Quando você for designado para avaliar alguém — ou precisar fazer sua autoavaliação — aparece aqui."
      />
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        Avaliações pendentes para você. O DHO vê o resultado com o nome de cada avaliador.
      </p>

      {tasks.map((t) => (
        <div
          key={t.roundId + t.kind}
          className="flex items-center justify-between gap-4 rounded-xl border border-border bg-surface p-4"
        >
          <div className="flex min-w-0 items-center gap-3">
            <span
              className={
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-full " +
                (t.self ? "bg-primary/15 text-primary" : "bg-accent/15 text-accent")
              }
            >
              {t.self ? <UserCheck className="h-5 w-5" /> : <Users className="h-5 w-5" />}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">
                {t.self ? "Sua autoavaliação" : `Avaliar ${t.subjectName}`}
              </p>
              <p className="text-xs text-muted">{t.typeTitle}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <Badge tone={t.self ? "primary" : "accent"}>
              {t.self ? "Autoavaliação" : "Feedback"}
            </Badge>
            <Button size="sm" onClick={() => start(t)} disabled={!forms[t.typeSlug]}>
              Preencher
            </Button>
          </div>
        </div>
      ))}

      {active && (
        <EvaluationFormModal
          open
          form={active.form}
          subjectId={active.task.roundId}
          subjectName={active.task.subjectName}
          eyebrow={active.task.self ? "Autoavaliação" : `Avaliação de ${active.task.subjectName}`}
          onClose={() => setActive(null)}
          onSubmitted={() => setActive(null)}
          onSubmit={(payload) =>
            submitRoundEvaluation({
              roundId: active.task.roundId,
              self: active.task.self,
              observations: payload.observations,
              answers: payload.answers,
            })
          }
        />
      )}
    </div>
  );
}
