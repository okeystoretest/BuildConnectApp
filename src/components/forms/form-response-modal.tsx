"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, EyeOff, Loader2, X } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/providers/toast-provider";
import { QuestionInput } from "./question-input";
import { isQuestionAnswered } from "@/lib/forms/validation";
import { submitFormResponse } from "@/lib/forms/response-actions";
import type { FormAnswerInput, FormDraft } from "@/types/form";

export interface FormResponseModalProps {
  open: boolean;
  onClose: () => void;
  form: FormDraft;
  onSubmitted?: () => void;
}

/**
 * Preenchimento de um formulário do DHO, paginado por seção.
 *
 * "Respondida" vem de `isQuestionAnswered`, a mesma função que a validação do
 * servidor usa. Se a tela tivesse a sua noção, o usuário veria "Próximo"
 * liberado e o envio recusado — ou o contrário, o que é pior.
 */
export function FormResponseModal({ open, onClose, form, onSubmitted }: FormResponseModalProps) {
  const router = useRouter();
  const { success, error } = useToast();
  const [answers, setAnswers] = useState<Record<string, FormAnswerInput>>({});
  const [page, setPage] = useState(0);
  const [submitting, startSubmit] = useTransition();

  const questions = useMemo(() => form.sections.flatMap((s) => s.questions), [form]);
  const answeredCount = questions.filter((q) => isQuestionAnswered(q, answers[q.id])).length;
  const progressPct = Math.round((answeredCount / Math.max(questions.length, 1)) * 100);

  const lastPage = form.sections.length - 1;
  const currentSection = form.sections[page];
  const currentComplete = currentSection
    ? currentSection.questions.every((q) => !q.required || isQuestionAnswered(q, answers[q.id]))
    : true;

  function setAnswer(answer: FormAnswerInput) {
    setAnswers((prev) => ({ ...prev, [answer.questionId]: answer }));
  }

  function resetAll() {
    setAnswers({});
    setPage(0);
  }

  function handleClose() {
    if (submitting) return;
    resetAll();
    onClose();
  }

  function goNext() {
    if (!currentComplete) return;
    setPage((p) => Math.min(p + 1, lastPage));
  }
  function goBack() {
    setPage((p) => Math.max(p - 1, 0));
  }

  function handleSubmit() {
    const pending = questions.find((q) => q.required && !isQuestionAnswered(q, answers[q.id]));
    if (pending) {
      error(`Responda "${pending.label}".`);
      return;
    }
    startSubmit(async () => {
      // Só as perguntas efetivamente respondidas vão no envio: mandar um campo
      // vazio de uma opcional faria a validação de forma tropeçar à toa.
      const payload = questions
        .filter((q) => isQuestionAnswered(q, answers[q.id]))
        .map((q) => answers[q.id]!);
      const res = await submitFormResponse({ formId: form.id, answers: payload });
      if (res.ok) {
        success("Respostas enviadas com sucesso");
        resetAll();
        onClose();
        onSubmitted?.();
        router.refresh();
      } else {
        error(res.error ?? "Não foi possível enviar suas respostas.");
      }
    });
  }

  return (
    <Modal open={open} onClose={handleClose} className="max-w-3xl" dismissible={!submitting}>
      <div className="flex max-h-[92vh] flex-col">
        {/* Cabeçalho */}
        <header className="flex items-start justify-between gap-4 border-b border-border p-7">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted">
              Formulário do DHO
            </p>
            <h2 className="mt-1.5 text-2xl font-bold leading-tight text-foreground">{form.title}</h2>
            {form.description && (
              <p className="mt-2 text-sm leading-relaxed text-muted">{form.description}</p>
            )}
            {form.anonymous && (
              <p className="mt-3 inline-flex items-center gap-2 rounded-lg border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs font-medium text-foreground">
                <EyeOff className="h-3.5 w-3.5 text-accent" />
                Resposta anônima — seu nome não é gravado com o que você responder.
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Fechar"
            className="focus-ring flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-2 text-muted transition-colors hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        {/* Progresso */}
        <div className="border-b border-border px-7 py-4">
          <div className="mb-2 flex items-center justify-between text-sm text-muted">
            <span className="font-medium">
              Seção {page + 1} de {form.sections.length}
              {currentSection?.title ? ` · ${currentSection.title}` : ""}
            </span>
            <span>
              {answeredCount}/{questions.length} respondidas
            </span>
          </div>
          <Progress value={progressPct} />
        </div>

        {/* Corpo */}
        <div className="scrollbar-slim flex-1 space-y-5 overflow-y-auto px-7 py-6">
          {currentSection?.description && (
            <p className="text-sm leading-relaxed text-muted">{currentSection.description}</p>
          )}

          {currentSection?.questions.map((question) => (
            <div key={question.id} className="rounded-xl border border-border bg-surface p-5">
              <p
                id={`q-${question.id}`}
                className="text-base font-semibold leading-snug text-foreground"
              >
                {question.label}
                {question.required && (
                  <span className="ml-1 text-danger" aria-hidden="true">
                    *
                  </span>
                )}
              </p>
              {question.helpText && (
                <p className="mt-1 text-sm leading-relaxed text-muted">{question.helpText}</p>
              )}
              <div className="mt-3">
                <QuestionInput
                  question={question}
                  value={answers[question.id]}
                  onChange={setAnswer}
                />
              </div>
            </div>
          ))}

          {currentSection?.questions.length === 0 && (
            <p className="text-sm text-muted">Esta seção não tem perguntas.</p>
          )}
        </div>

        {/* Rodapé */}
        <footer className="flex items-center justify-between gap-3 border-t border-border p-5">
          <Button variant="ghost" size="lg" onClick={goBack} disabled={page === 0 || submitting}>
            <ChevronLeft className="h-4 w-4" />
            Voltar
          </Button>

          {page < lastPage ? (
            <Button size="lg" onClick={goNext} disabled={!currentComplete}>
              Próximo
              <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button size="lg" onClick={handleSubmit} disabled={submitting || !currentComplete}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {submitting ? "Enviando" : "Enviar respostas"}
            </Button>
          )}
        </footer>
      </div>
    </Modal>
  );
}
