"use client";

import { useState, useTransition } from "react";
import { Segmented } from "@/components/ui/segmented";
import { AnsweredEvaluationDetail } from "@/components/me/answered-evaluation-detail";
import {
  MyEvaluationsKanban,
  type EvaluationScope,
} from "@/components/me/my-evaluations-kanban";
import { ehAvaliacaoDeVideo } from "@/components/me/evaluation-task-meta";
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
  /** Tudo o que este usuário já respondeu, para a coluna "Concluídas". */
  answered: readonly AnsweredEvaluation[];
}

/**
 * O alternador escolhe o ESCOPO, não a forma de mostrar: a exibição é sempre o
 * quadro. Os rótulos dizem o assunto por extenso porque "360°" e "Vídeo" só
 * fazem sentido para quem já conhece os instrumentos.
 */
const SCOPES = [
  { value: "internas", label: "Avaliações Internas / Onboarding" },
  { value: "videos", label: "Avaliações de Vídeos" },
] as const satisfies readonly { value: EvaluationScope; label: string }[];

const SCOPE_LABEL: Record<EvaluationScope, string> = {
  internas: SCOPES[0].label,
  videos: SCOPES[1].label,
};

interface ActiveTask {
  task: MyEvaluationTask;
  form: EvalForm;
}

/**
 * Aba "Minhas avaliações": o que o usuário precisa preencher e o que já
 * respondeu, em quadro.
 *  - FEEDBACK: você foi designado para avaliar outra pessoa.
 *  - AUTOAVALIACAO: as avaliações sobre você fecharam; registre a sua.
 *  - FORMULARIO: formulário do DHO atribuído a você.
 *  - COMPREENSAO_VIDEO: você é Gestor e um colaborador do seu setor respondeu
 *    à pergunta de compreensão de uma Instrução em Vídeo — dê a nota.
 * O usuário responde só o próprio formulário; a consolidação (com o nome de
 * cada avaliador) é vista pelo DHO na aba de Resultados.
 */
export function MyEvaluationsPanel({ tasks, forms, answered }: MyEvaluationsPanelProps) {
  const [scope, setScope] = useState<EvaluationScope>("internas");
  const [detail, setDetail] = useState<AnsweredEvaluation | null>(null);
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

  if (detail) return <AnsweredEvaluationDetail item={detail} onBack={() => setDetail(null)} />;

  /*
   * Pendências do OUTRO escopo.
   *
   * O quadro mostra um escopo de cada vez, e sem este aviso uma pendência de
   * vídeo ficaria invisível para quem abre a tela e só olha "Internas" — que é
   * o estado inicial. Pendência que não aparece é a que ninguém responde.
   */
  const outro: EvaluationScope = scope === "internas" ? "videos" : "internas";
  const pendentesNoOutro = tasks.filter(
    (t) => ehAvaliacaoDeVideo(t.kind) === (outro === "videos"),
  ).length;

  return (
    <div className="space-y-4">
      <Segmented
        options={SCOPES}
        value={scope}
        onChange={setScope}
        ariaLabel="Escopo das avaliações"
        /* Empilha no celular: lado a lado em 360px, "Avaliações Internas /
           Onboarding" não cabe na linha e transborda o botão, que tem altura
           fixa. O `twMerge` do `cn` faz esta classe vencer a do componente. */
        className="w-full grid-cols-1 sm:max-w-xl sm:grid-cols-2"
      />

      <MyEvaluationsKanban
        scope={scope}
        tasks={tasks}
        answered={answered}
        forms={forms}
        loadingFormId={loadingFormId}
        onStart={start}
        onOpenAnswered={setDetail}
      />

      {pendentesNoOutro > 0 && (
        <button
          type="button"
          onClick={() => setScope(outro)}
          className="focus-ring w-full rounded-xl border border-warning/40 bg-warning/10 px-4 py-2.5 text-left text-xs text-warning transition-colors hover:border-warning/60 hover:bg-warning/20"
        >
          {pendentesNoOutro === 1
            ? `Há 1 pendência em ${SCOPE_LABEL[outro]}.`
            : `Há ${pendentesNoOutro} pendências em ${SCOPE_LABEL[outro]}.`}{" "}
          <span className="font-semibold underline">Ver</span>
        </button>
      )}

      {/* Formulário anônimo não guarda quem respondeu, por desenho. Dizer isso
          evita que a pessoa ache que o envio dela se perdeu. */}
      <p className="border-t border-border pt-3 text-[11px] text-muted">
        Só as suas respostas — ninguém mais alcança este quadro. Formulários anônimos não aparecem
        aqui: eles não guardam quem respondeu, e é isso que os torna anônimos.
      </p>

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
