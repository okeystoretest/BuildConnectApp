"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Lock, Plus, Save, Send, Trash2 } from "lucide-react";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { QuestionEditor } from "./question-editor";
import { PublishModal } from "./publish-modal";
import { saveForm } from "@/lib/forms/actions";
import { useToast } from "@/providers/toast-provider";
import { FORM_STATUS_LABEL } from "@/types/form";
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
 * Ids de perguntas e opções novas são locais (`crypto.randomUUID()`) e
 * descartados no `saveForm`, que recria a estrutura — o próximo carregamento
 * traz os ids do banco.
 */
export function FormBuilder({ initial }: FormBuilderProps) {
  const router = useRouter();
  const { success, error } = useToast();
  const [draft, setDraft] = useState<FormDraft>(initial);
  const [publishing, setPublishing] = useState(false);
  const [saving, startSave] = useTransition();

  // A tela só conhece o status; a contagem de respostas mora no servidor, que
  // é quem recusa de fato (canEditStructure). Travar já no PUBLICADO deixa a
  // tela um passo mais conservadora que a regra, nunca mais permissiva.
  const locked = draft.status !== "RASCUNHO";

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

  function handleSave() {
    startSave(async () => {
      const res = await saveForm({ formId: draft.id, draft });
      if (res.ok) {
        success("Formulário salvo");
        // Recarrega para trocar os ids locais pelos do banco — a estrutura foi
        // recriada no servidor.
        router.refresh();
      } else {
        error(res.error ?? "Não foi possível salvar o formulário.");
      }
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
          <p className="text-sm text-foreground">
            Este formulário já recebeu respostas. Só título e descrição podem mudar.
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
        <Button variant="secondary" onClick={handleSave} disabled={saving}>
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
