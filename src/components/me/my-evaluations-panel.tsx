"use client";

import { useState, useTransition } from "react";
import { ClipboardList, FileText, MonitorPlay, UserCheck, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs, TabPanel, type TabItem } from "@/components/ui/tabs";
import { AnsweredEvaluationsPanel } from "@/components/me/answered-evaluations-panel";
import { EvaluationFormModal } from "@/components/hr/evaluation-form-modal";
import { FormResponseModal } from "@/components/forms/form-response-modal";
import { ComprehensionGradeModal } from "@/components/me/comprehension-grade-modal";
import { submitRoundEvaluation } from "@/lib/evaluation-rounds-actions";
import { getAssignedForm } from "@/lib/forms/response-actions";
import { usePendingEvaluations } from "@/providers/pending-evaluations-provider";
import { useToast } from "@/providers/toast-provider";
import type {
  AnsweredEvaluation,
  EvalForm,
  MyEvaluationTask,
  VideoComprehensionTask,
} from "@/types/evaluation";
import type { FormDraft } from "@/types/form";

export interface MyEvaluationsPanelProps {
  tasks: readonly MyEvaluationTask[];
  /** Formulários dos instrumentos de rodada, indexados por slug. */
  forms: Record<string, EvalForm>;
  /** Tudo o que este usuário já respondeu, para a aba "Concluídas". */
  answered: readonly AnsweredEvaluation[];
}

const TABS: readonly TabItem[] = [
  { id: "pendentes", label: "Pendentes" },
  { id: "concluidas", label: "Concluídas" },
];

interface ActiveTask {
  task: MyEvaluationTask;
  form: EvalForm;
}

/**
 * Aba "Minhas avaliações": lista o que o usuário precisa preencher.
 *  - FEEDBACK: você foi designado para avaliar outra pessoa.
 *  - AUTOAVALIACAO: as avaliações sobre você fecharam; registre a sua.
 *  - FORMULARIO: formulário do DHO atribuído a você.
 *  - COMPREENSAO_VIDEO: você é Gestor e um colaborador do seu setor respondeu
 *    à pergunta de compreensão de uma Instrução em Vídeo — dê a nota.
 * O usuário responde só o próprio formulário; a consolidação (com o nome de
 * cada avaliador) é vista pelo DHO na aba de Resultados.
 */
export function MyEvaluationsPanel({ tasks, forms, answered }: MyEvaluationsPanelProps) {
  const [tab, setTab] = useState("pendentes");
  const [active, setActive] = useState<ActiveTask | null>(null);
  const [activeForm, setActiveForm] = useState<FormDraft | null>(null);
  const [activeComprehension, setActiveComprehension] = useState<VideoComprehensionTask | null>(
    null,
  );
  const [loadingFormId, setLoadingFormId] = useState<string | null>(null);
  const [, startLoad] = useTransition();
  const { refresh: refreshPendingCount } = usePendingEvaluations();
  const { error } = useToast();

  function start(task: MyEvaluationTask) {
    if (task.kind === "COMPREENSAO_VIDEO") {
      if (task.comprehension) setActiveComprehension(task.comprehension);
      return;
    }
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

  /*
   * O estado vazio não pode ser um `return` antecipado: ele engoliria as abas
   * e esconderia o histórico de quem está com a fila em dia — justamente quem
   * mais tem o que reler.
   */
  const pending =
    tasks.length === 0 ? (
      <EmptyState
        icon={<ClipboardList className="h-5 w-5" />}
        title="Nenhuma pendência"
        description="Quando você for designado para avaliar alguém, precisar fazer sua autoavaliação, receber um formulário do DHO ou tiver uma resposta de vídeo da sua equipe para avaliar, aparece aqui."
      />
    ) : (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        Pendências para você. O DHO vê o resultado com o nome de cada avaliador.
      </p>

      {tasks.map((t) => {
        const isForm = t.kind === "FORMULARIO";
        const isComprehension = t.kind === "COMPREENSAO_VIDEO";
        return (
          <div
            key={`${t.kind}-${t.formId ?? t.comprehension?.comprehensionId ?? t.roundId}`}
            className="flex items-center justify-between gap-4 rounded-xl border border-border bg-surface p-4"
          >
            <div className="flex min-w-0 items-center gap-3">
              <span
                className={
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full " +
                  (t.self ? "bg-primary/15 text-primary" : "bg-accent/15 text-accent")
                }
              >
                {isComprehension ? (
                  <MonitorPlay className="h-5 w-5" />
                ) : isForm ? (
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
                <p className="truncate text-xs text-muted">
                  {isComprehension && t.comprehension
                    ? `${t.typeTitle} · ${t.comprehension.videoTitle}`
                    : t.typeTitle}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <Badge tone={t.self ? "primary" : "accent"}>
                {isComprehension
                  ? "Compreensão"
                  : isForm
                    ? "Formulário"
                    : t.self
                      ? "Autoavaliação"
                      : "Feedback"}
              </Badge>
              <Button
                size="sm"
                onClick={() => start(t)}
                disabled={
                  isComprehension
                    ? false
                    : isForm
                      ? loadingFormId === t.formId
                      : !forms[t.typeSlug]
                }
              >
                {isComprehension
                  ? "Avaliar"
                  : isForm
                    ? loadingFormId === t.formId
                      ? "Abrindo"
                      : "Responder"
                    : "Preencher"}
              </Button>
            </div>
          </div>
        );
      })}

    </div>
  );

  return (
    <div className="space-y-4">
      <Tabs items={TABS} value={tab} onValueChange={setTab} />
      <TabPanel tabId={tab}>
        {tab === "pendentes" ? pending : <AnsweredEvaluationsPanel items={answered} />}
      </TabPanel>

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

      {activeComprehension && (
        <ComprehensionGradeModal
          task={activeComprehension}
          onClose={() => setActiveComprehension(null)}
          onGraded={() => {
            setActiveComprehension(null);
            refreshPendingCount();
          }}
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
