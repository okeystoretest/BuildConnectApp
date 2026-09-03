"use client";

import { useState, useTransition } from "react";
import { ClipboardList, FileText, UserCheck, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { EvaluationFormModal } from "@/components/hr/evaluation-form-modal";
import { FormResponseModal } from "@/components/forms/form-response-modal";
import { submitRoundEvaluation } from "@/lib/evaluation-rounds-actions";
import { getAssignedForm } from "@/lib/forms/response-actions";
import { usePendingEvaluations } from "@/providers/pending-evaluations-provider";
import { useToast } from "@/providers/toast-provider";
import type { EvalForm, MyEvaluationTask } from "@/types/evaluation";
import type { FormDraft } from "@/types/form";

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
 * Aba "Minhas avaliações": lista o que o usuário precisa preencher.
 *  - FEEDBACK: você foi designado para avaliar outra pessoa.
 *  - AUTOAVALIACAO: as avaliações sobre você fecharam; registre a sua.
 *  - FORMULARIO: formulário do DHO atribuído a você.
 * O usuário responde só o próprio formulário; a consolidação (com o nome de
 * cada avaliador) é vista pelo DHO na aba de Resultados.
 */
export function MyEvaluationsPanel({ tasks, forms }: MyEvaluationsPanelProps) {
  const [active, setActive] = useState<ActiveTask | null>(null);
  const [activeForm, setActiveForm] = useState<FormDraft | null>(null);
  const [loadingFormId, setLoadingFormId] = useState<string | null>(null);
  const [, startLoad] = useTransition();
  const { refresh: refreshPendingCount } = usePendingEvaluations();
  const { error } = useToast();

  function start(task: MyEvaluationTask) {
    // Formulário do DHO: a estrutura não vem com a lista (seria carregar todo
    // formulário de todo mundo a cada abertura da página) — busca-se ao abrir.
    if (task.kind === "FORMULARIO") {
      const formId = task.formId;
      if (!formId) return;
      setLoadingFormId(formId);
      startLoad(async () => {
        const draft = await getAssignedForm(formId);
        setLoadingFormId(null);
        if (!draft) {
          error("Este formulário não está mais disponível para você.");
          return;
        }
        setActiveForm(draft);
      });
      return;
    }

    const form = forms[task.typeSlug];
    if (!form || form.sections.length === 0) return;
    setActive({ task, form });
  }

  if (tasks.length === 0) {
    return (
      <EmptyState
        icon={<ClipboardList className="h-5 w-5" />}
        title="Nenhuma pendência"
        description="Quando você for designado para avaliar alguém, precisar fazer sua autoavaliação ou receber um formulário do DHO, aparece aqui."
      />
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        Pendências para você. O DHO vê o resultado com o nome de cada avaliador.
      </p>

      {tasks.map((t) => {
        const isForm = t.kind === "FORMULARIO";
        return (
          <div
            key={`${t.kind}-${t.formId ?? t.roundId}`}
            className="flex items-center justify-between gap-4 rounded-xl border border-border bg-surface p-4"
          >
            <div className="flex min-w-0 items-center gap-3">
              <span
                className={
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full " +
                  (t.self ? "bg-primary/15 text-primary" : "bg-accent/15 text-accent")
                }
              >
                {isForm ? (
                  <FileText className="h-5 w-5" />
                ) : t.self ? (
                  <UserCheck className="h-5 w-5" />
                ) : (
                  <Users className="h-5 w-5" />
                )}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">
                  {isForm
                    ? t.subjectName
                    : t.self
                      ? "Sua autoavaliação"
                      : `Avaliar ${t.subjectName}`}
                </p>
                <p className="text-xs text-muted">{t.typeTitle}</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <Badge tone={t.self ? "primary" : "accent"}>
                {isForm ? "Formulário" : t.self ? "Autoavaliação" : "Feedback"}
              </Badge>
              <Button
                size="sm"
                onClick={() => start(t)}
                disabled={
                  isForm ? loadingFormId === t.formId : !forms[t.typeSlug]
                }
              >
                {isForm ? (loadingFormId === t.formId ? "Abrindo" : "Responder") : "Preencher"}
              </Button>
            </div>
          </div>
        );
      })}

      {active && (
        <EvaluationFormModal
          open
          form={active.form}
          subjectId={active.task.roundId}
          subjectName={active.task.subjectName}
          eyebrow={active.task.self ? "Autoavaliação" : `Avaliação de ${active.task.subjectName}`}
          onClose={() => setActive(null)}
          onSubmitted={() => {
            setActive(null);
            // Derruba o indicador da barra lateral na hora, sem esperar o
            // ciclo do poll nem o router.refresh() chegar ao layout.
            refreshPendingCount();
          }}
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

      {activeForm && (
        <FormResponseModal
          open
          form={activeForm}
          onClose={() => setActiveForm(null)}
          onSubmitted={() => {
            setActiveForm(null);
            refreshPendingCount();
          }}
        />
      )}
    </div>
  );
}
