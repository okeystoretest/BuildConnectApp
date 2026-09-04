"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, Loader2, Lock, Plus, Save, Send, Trash2 } from "lucide-react";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Modal } from "@/components/ui/modal";
import { QuestionEditor } from "./question-editor";
import { PublishModal } from "./publish-modal";
import { saveForm } from "@/lib/forms/actions";
import { useToast } from "@/providers/toast-provider";
import { FORM_STATUS_LABEL } from "@/types/form";
import type { RemovalImpact } from "@/lib/forms/rules";
import type { FormDraft, FormQuestionDraft, FormSectionDraft } from "@/types/form";

export interface FormBuilderProps {
  /** Rascunho vindo do servidor. Vira estado local até "Salvar". */
  initial: FormDraft;
}

/**
 * Construtor de formulários do DHO.
 *
 * Salvar é EXPLÍCITO, não autosave: o estado inteiro vive aqui até o botão. O
 * Google Forms grava a cada tecla; aqui isso seria uma Server Action por
 * caractere.
 *
 * Ids de perguntas e opções novas são locais (`crypto.randomUUID()`) e vão
 * gravados como estão: é por eles que o servidor reconhece cada linha no
 * salvamento seguinte, em vez de recriá-la — e é o que preserva as respostas
 * já dadas.
 *
 * Formulário respondido é editável. O que protege não é mais a trava, e sim o
 * aviso: `saveForm` recusa a primeira tentativa quando a alteração destrói
 * respostas, devolve o que se perde, e esta tela pergunta antes de reenviar.
 */
export function FormBuilder({ initial }: FormBuilderProps) {
  const router = useRouter();
  const { success, error } = useToast();
  const [draft, setDraft] = useState<FormDraft>(initial);
  const [publishing, setPublishing] = useState(false);
  const [saving, startSave] = useTransition();
  /** O que o salvamento vai destruir, quando o servidor pede confirmação. */
  const [removals, setRemovals] = useState<RemovalImpact[] | null>(null);

  // Só o encerrado trava. É resultado congelado: editá-lo mudaria o significado
  // de um número que alguém já leu. Para mexer, reabra — a rodada nova é onde
  // estrutura nova faz sentido.
  const locked = draft.status === "ENCERRADO";

  function patchDraft(patch: Partial<FormDraft>) {
    setDraft((prev) => ({ ...prev, ...patch }));
  }

  function patchSection(sectionId: string, patch: Partial<FormSectionDraft>) {
    setDraft((prev) => ({
      ...prev,
      sections: prev.sections.map((s) => (s.id === sectionId ? { ...s, ...patch } : s)),
    }));
  }

  function newQuestion(order: number): FormQuestionDraft {
    return {
      id: crypto.randomUUID(),
      kind: "MULTIPLA_ESCOLHA",
      label: "",
      required: false,
      order,
      options: [{ id: crypto.randomUUID(), label: "Opção 1", order: 0 }],
    };
  }

  function addSection() {
    setDraft((prev) => ({
      ...prev,
      sections: [
        ...prev.sections,
        {
          id: crypto.randomUUID(),
          title: `Seção ${prev.sections.length + 1}`,
          order: prev.sections.length,
          questions: [newQuestion(0)],
        },
      ],
    }));
  }

  function removeSection(sectionId: string) {
    setDraft((prev) => ({
      ...prev,
      sections: prev.sections
        .filter((s) => s.id !== sectionId)
        .map((s, i) => ({ ...s, order: i })),
    }));
  }

  function addQuestion(sectionId: string) {
    setDraft((prev) => ({
      ...prev,
      sections: prev.sections.map((s) =>
        s.id === sectionId
          ? { ...s, questions: [...s.questions, newQuestion(s.questions.length)] }
          : s,
      ),
    }));
  }

  function patchQuestion(
    sectionId: string,
    questionId: string,
    patch: Partial<FormQuestionDraft>,
  ) {
    setDraft((prev) => ({
      ...prev,
      sections: prev.sections.map((s) =>
        s.id === sectionId
          ? {
              ...s,
              questions: s.questions.map((q) => (q.id === questionId ? { ...q, ...patch } : q)),
            }
          : s,
      ),
    }));
  }

  function removeQuestion(sectionId: string, questionId: string) {
    setDraft((prev) => ({
      ...prev,
      sections: prev.sections.map((s) =>
        s.id === sectionId
          ? {
              ...s,
              questions: s.questions
                .filter((q) => q.id !== questionId)
                .map((q, i) => ({ ...q, order: i })),
            }
          : s,
      ),
    }));
  }

  function duplicateQuestion(sectionId: string, questionId: string) {
    setDraft((prev) => ({
      ...prev,
      sections: prev.sections.map((s) => {
        if (s.id !== sectionId) return s;
        const at = s.questions.findIndex((q) => q.id === questionId);
        if (at < 0) return s;
        const original = s.questions[at]!;
        const copy: FormQuestionDraft = {
          ...original,
          id: crypto.randomUUID(),
          options: original.options.map((o) => ({ ...o, id: crypto.randomUUID() })),
        };
        const questions = [...s.questions];
        questions.splice(at + 1, 0, copy);
        return { ...s, questions: questions.map((q, i) => ({ ...q, order: i })) };
      }),
    }));
  }

  function moveQuestion(sectionId: string, questionId: string, delta: -1 | 1) {
    setDraft((prev) => ({
      ...prev,
      sections: prev.sections.map((s) => {
        if (s.id !== sectionId) return s;
        const at = s.questions.findIndex((q) => q.id === questionId);
        const to = at + delta;
        if (at < 0 || to < 0 || to >= s.questions.length) return s;
        const questions = [...s.questions];
        [questions[at], questions[to]] = [questions[to]!, questions[at]!];
        return { ...s, questions: questions.map((q, i) => ({ ...q, order: i })) };
      }),
    }));
  }

  function handleSave(confirmRemovals = false) {
    startSave(async () => {
      const res = await saveForm({ formId: draft.id, draft, confirmRemovals });
      if (res.ok) {
        setRemovals(null);
        success("Formulário salvo");
        router.refresh();
        return;
      }
      // O servidor recusou porque a alteração apaga respostas. Ele não gravou
      // nada: devolveu o que se perde para esta tela perguntar.
      if (res.removals && res.removals.length > 0) {
        setRemovals(res.removals);
        return;
      }
      error(res.error ?? "Não foi possível salvar o formulário.");
    });
  }

  let questionNumber = 0;

  return (
    <AppShell eyebrow="DHO" title="Construtor de formulários">
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/setores/rh"
          className="focus-ring inline-flex items-center gap-2 rounded-lg text-sm text-muted transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar ao DHO
        </Link>
        <Badge tone={draft.status === "PUBLICADO" ? "accent" : "neutral"}>
          {FORM_STATUS_LABEL[draft.status]}
        </Badge>
      </div>

      {locked && (
        <div className="mt-4 flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/10 p-4">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <p className="text-sm leading-relaxed text-foreground">
            Este formulário está encerrado, e o resultado dele está congelado. Para mudar as
            perguntas, reabra no bloco Formulários do DHO — reabrir começa uma rodada nova, sem
            apagar as respostas da anterior.
          </p>
        </div>
      )}

      <div className="mt-4 rounded-xl border border-border bg-surface p-5">
        <Input
          value={draft.title}
          onChange={(e) => patchDraft({ title: e.target.value })}
          placeholder="Título do formulário"
          aria-label="Título do formulário"
          className="h-12 rounded-xl text-lg font-semibold"
        />
        <Textarea
          value={draft.description ?? ""}
          onChange={(e) => patchDraft({ description: e.target.value })}
          placeholder="Descrição (opcional)"
          aria-label="Descrição do formulário"
          rows={2}
          className="mt-3"
        />
      </div>

      <div className="mt-4 space-y-4">
        {draft.sections.map((section, si) => (
          <section key={section.id} className="rounded-xl border border-border bg-surface-2/40 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
              <div className="min-w-0 flex-1">
                <Input
                  value={section.title}
                  onChange={(e) => patchSection(section.id, { title: e.target.value })}
                  placeholder={`Seção ${si + 1}`}
                  aria-label={`Título da seção ${si + 1}`}
                  disabled={locked}
                  className="h-11 rounded-xl font-semibold"
                />
                <Input
                  value={section.description ?? ""}
                  onChange={(e) => patchSection(section.id, { description: e.target.value })}
                  placeholder="Descrição da seção (opcional)"
                  aria-label={`Descrição da seção ${si + 1}`}
                  disabled={locked}
                  className="mt-2 text-sm"
                />
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeSection(section.id)}
                aria-label={`Excluir seção ${si + 1}`}
                disabled={locked || draft.sections.length <= 1}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>

            <div className="mt-4 space-y-3">
              {section.questions.map((question) => {
                questionNumber += 1;
                return (
                  <QuestionEditor
                    key={question.id}
                    question={question}
                    index={questionNumber}
                    disabled={locked}
                    onChange={(patch) => patchQuestion(section.id, question.id, patch)}
                    onDuplicate={() => duplicateQuestion(section.id, question.id)}
                    onDelete={() => removeQuestion(section.id, question.id)}
                    onMoveUp={() => moveQuestion(section.id, question.id, -1)}
                    onMoveDown={() => moveQuestion(section.id, question.id, 1)}
                  />
                );
              })}
            </div>

            <Button
              variant="secondary"
              size="sm"
              className="mt-3"
              onClick={() => addQuestion(section.id)}
              disabled={locked}
            >
              <Plus className="h-4 w-4" />
              Adicionar pergunta
            </Button>
          </section>
        ))}
      </div>

      <Button variant="secondary" className="mt-4" onClick={addSection} disabled={locked}>
        <Plus className="h-4 w-4" />
        Adicionar seção
      </Button>

      {/* Barra de ações: fica ao alcance sem obrigar a rolar até o fim. */}
      <div className="sticky bottom-4 z-10 mt-6 flex items-center justify-end gap-3 rounded-xl border border-border bg-surface/95 p-3 shadow-lg backdrop-blur">
        <Button variant="secondary" onClick={() => handleSave()} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? "Salvando" : "Salvar"}
        </Button>
        {draft.status === "RASCUNHO" && (
          <Button onClick={() => setPublishing(true)} disabled={saving}>
            <Send className="h-4 w-4" />
            Publicar
          </Button>
        )}
      </div>

      {/* Confirmação de perda. Só aparece quando o servidor já recusou uma vez
          e disse exatamente o que sai — a lista não é estimativa da tela. */}
      <Modal
        open={removals !== null}
        onClose={() => setRemovals(null)}
        title="Esta alteração apaga respostas"
        description="O que sair leva junto o que já foi respondido. Não tem volta."
        className="max-w-lg"
        dismissible={!saving}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setRemovals(null)} disabled={saving}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={() => handleSave(true)} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {saving ? "Salvando" : "Salvar assim mesmo"}
            </Button>
          </div>
        }
      >
        <div className="p-6">
          <div className="mb-3 flex items-center gap-2 text-warning">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-sm font-semibold">
              {removals?.length} item(ns) serão removidos
            </span>
          </div>
          <ul className="space-y-2">
            {removals?.map((r) => (
              <li
                key={`${r.kind}-${r.id}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm"
              >
                <span className="min-w-0 truncate text-foreground">
                  <span className="mr-2 text-xs uppercase tracking-wide text-muted">{r.kind}</span>
                  {r.label}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-danger">
                  {r.affected} resposta(s)
                </span>
              </li>
            ))}
          </ul>
        </div>
      </Modal>

      <PublishModal
        open={publishing}
        formId={draft.id}
        onClose={() => setPublishing(false)}
        onPublished={() => {
          setPublishing(false);
          router.refresh();
        }}
      />
    </AppShell>
  );
}
