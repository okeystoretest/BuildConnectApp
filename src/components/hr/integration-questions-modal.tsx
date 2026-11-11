"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2, Plus, Trash2, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/providers/toast-provider";
import { fetchFilmQuestions, saveFilmQuestions } from "@/lib/integration/admin-actions";
import type { QuestionDraft, QuestionRemoval } from "@/types/integration";

export interface IntegrationQuestionsModalProps {
  assetId: string;
  filmTitle: string;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Editor do questionário de um filme.
 *
 * Simples de propósito: enunciado, alternativas, e um rádio marcando a
 * correta. Não é o construtor de formulários do DHO e não tenta ser — aqui
 * toda pergunta é de escolha única com gabarito, que é o que a prova de um
 * filme precisa. Tipos de pergunta, escalas e seções seriam opções que
 * ninguém pediu.
 *
 * O botão de salvar fica travado enquanto houver pergunta sem correta
 * marcada: o servidor recusa de qualquer forma (ver `questions-core`), e
 * deixar a tela permitir o envio só para receber "não" de volta é ruído.
 */
export function IntegrationQuestionsModal({
  assetId,
  filmTitle,
  onClose,
  onSaved,
}: IntegrationQuestionsModalProps) {
  const { success, error } = useToast();
  const [draft, setDraft] = useState<QuestionDraft[] | null>(null);
  const [removals, setRemovals] = useState<QuestionRemoval[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  useEffect(() => {
    let alive = true;
    fetchFilmQuestions(assetId)
      .then((rows) => {
        if (alive) setDraft(rows);
      })
      .catch(() => {
        if (alive) setProblem("Não foi possível carregar as perguntas.");
      });
    return () => {
      alive = false;
    };
  }, [assetId]);

  function patch(index: number, change: Partial<QuestionDraft>) {
    setDraft((prev) =>
      (prev ?? []).map((q, i) => (i === index ? { ...q, ...change } : q)),
    );
  }

  function addQuestion() {
    setDraft((prev) => [
      ...(prev ?? []),
      {
        label: "",
        options: [
          { label: "", correct: true },
          { label: "", correct: false },
          { label: "", correct: false },
        ],
      },
    ]);
  }

  /** Sem correta marcada a correção não teria resposta certa nenhuma. */
  const incomplete = (draft ?? []).some(
    (q) =>
      q.label.trim().length < 5 ||
      q.options.filter((o) => o.label.trim().length > 0).length < 2 ||
      q.options.filter((o) => o.correct && o.label.trim().length > 0).length !== 1,
  );

  function save(confirmRemovals = false) {
    if (!draft) return;
    setProblem(null);
    startSaving(async () => {
      const res = await saveFilmQuestions(assetId, draft, confirmRemovals);
      if (res.ok) {
        success("Questionário salvo");
        onSaved();
        return;
      }
      if (res.removals && res.removals.length > 0) {
        setRemovals(res.removals);
        return;
      }
      setProblem(res.error ?? "Não foi possível salvar.");
      error(res.error ?? "Não foi possível salvar.");
    });
  }

  return (
    <Modal
      open
      onClose={onClose}
      dismissible={!saving}
      title={`Questionário — ${filmTitle}`}
      description="Escolha única. Marque a alternativa correta de cada pergunta."
      className="max-w-3xl"
      footer={
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted">
            {draft === null
              ? ""
              : incomplete
                ? "Há pergunta sem enunciado, sem duas alternativas ou sem correta marcada."
                : `${draft.length} pergunta(s). Nota de corte: 7 de 10.`}
          </p>
          <div className="flex shrink-0 gap-3">
            <Button variant="ghost" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={() => save()} disabled={draft === null || incomplete || saving}>
              {saving ? "Salvando" : "Salvar"}
            </Button>
          </div>
        </div>
      }
    >
      <div className="scrollbar-slim max-h-[65vh] space-y-5 overflow-y-auto p-6">
        {draft === null && !problem && (
          <div className="flex items-center gap-2 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando perguntas…
          </div>
        )}

        {problem && (
          <div className="flex gap-2.5 rounded-lg border border-danger/30 bg-danger/10 p-3">
            <TriangleAlert className="h-4 w-4 shrink-0 text-danger" />
            <p className="text-xs leading-relaxed text-foreground">{problem}</p>
          </div>
        )}

        {draft?.map((question, qi) => (
          <div key={question.id ?? `novo-${qi}`} className="rounded-xl border border-border p-4">
            <div className="flex items-start justify-between gap-3">
              <label
                htmlFor={`q-${qi}`}
                className="text-xs font-semibold uppercase tracking-widest text-muted"
              >
                Pergunta {qi + 1}
              </label>
              <button
                type="button"
                onClick={() => setDraft((prev) => (prev ?? []).filter((_, i) => i !== qi))}
                aria-label={`Excluir pergunta ${qi + 1}`}
                className="focus-ring rounded-lg p-1 text-muted transition-colors hover:text-danger"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>

            <Textarea
              id={`q-${qi}`}
              rows={2}
              value={question.label}
              onChange={(e) => patch(qi, { label: e.target.value })}
              placeholder="Enunciado da pergunta"
              className="mt-2"
            />

            <div className="mt-3 space-y-2">
              {question.options.map((option, oi) => (
                <div key={option.id ?? `novo-${oi}`} className="flex items-center gap-2.5">
                  <label
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 text-xs font-medium transition-colors",
                      option.correct
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted hover:border-border-strong",
                    )}
                  >
                    <input
                      type="radio"
                      name={`correta-${qi}`}
                      checked={option.correct}
                      onChange={() =>
                        patch(qi, {
                          options: question.options.map((o, i) => ({ ...o, correct: i === oi })),
                        })
                      }
                      className="h-3.5 w-3.5 accent-accent"
                    />
                    Correta
                  </label>

                  <Input
                    value={option.label}
                    onChange={(e) =>
                      patch(qi, {
                        options: question.options.map((o, i) =>
                          i === oi ? { ...o, label: e.target.value } : o,
                        ),
                      })
                    }
                    placeholder={`Alternativa ${oi + 1}`}
                    aria-label={`Pergunta ${qi + 1}, alternativa ${oi + 1}`}
                  />

                  <button
                    type="button"
                    disabled={question.options.length <= 2}
                    onClick={() =>
                      patch(qi, { options: question.options.filter((_, i) => i !== oi) })
                    }
                    aria-label={`Excluir alternativa ${oi + 1}`}
                    className="focus-ring rounded-lg p-1 text-muted transition-colors hover:text-danger disabled:opacity-40 disabled:hover:text-muted"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}

              {question.options.length < 6 && (
                <button
                  type="button"
                  onClick={() =>
                    patch(qi, {
                      options: [...question.options, { label: "", correct: false }],
                    })
                  }
                  className="focus-ring text-xs font-medium text-primary"
                >
                  + Alternativa
                </button>
              )}
            </div>
          </div>
        ))}

        {draft !== null && (
          <Button variant="secondary" onClick={addQuestion} className="w-full">
            <Plus className="h-4 w-4" />
            Adicionar pergunta
          </Button>
        )}
      </div>

      {/* Nada se grava enquanto o DHO não vir o que perde. */}
      {removals && (
        <Modal
          open
          onClose={() => setRemovals(null)}
          title="Esta alteração apaga respostas"
          className="max-w-md"
          footer={
            <div className="flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setRemovals(null)}>
                Cancelar
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  setRemovals(null);
                  save(true);
                }}
              >
                Apagar e salvar
              </Button>
            </div>
          }
        >
          <div className="space-y-3 p-6">
            <p className="text-sm text-muted">
              O que sai leva junto respostas já enviadas por convidados:
            </p>
            <ul className="space-y-1.5">
              {removals.map((r, i) => (
                <li key={i} className="rounded-lg border border-border bg-surface-2 p-3 text-xs">
                  <span className="font-medium text-foreground">
                    {r.kind === "pergunta" ? "Pergunta" : "Alternativa"}: {r.label}
                  </span>
                  <span className="mt-0.5 block text-muted">{r.affected} resposta(s)</span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted">
              As notas já atribuídas não mudam — elas foram gravadas no momento do envio.
            </p>
          </div>
        </Modal>
      )}
    </Modal>
  );
}
