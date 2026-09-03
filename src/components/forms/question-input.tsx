"use client";

import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { FormAnswerInput, FormQuestionDraft } from "@/types/form";

/**
 * Campo de resposta, despachado pelo tipo da pergunta.
 *
 * Controlado por fora: o modal guarda todas as respostas e este componente só
 * lê e devolve a de uma pergunta. É o que permite "salvar é explícito" — nada
 * aqui conversa com o servidor.
 */
export interface QuestionInputProps {
  question: FormQuestionDraft;
  value: FormAnswerInput | undefined;
  onChange: (answer: FormAnswerInput) => void;
}

export function QuestionInput({ question, value, onChange }: QuestionInputProps) {
  const id = `q-${question.id}`;

  switch (question.kind) {
    case "TEXTO_CURTO":
      return (
        <Input
          id={id}
          value={value?.text ?? ""}
          onChange={(e) => onChange({ questionId: question.id, text: e.target.value })}
          className="h-11 rounded-xl"
        />
      );

    case "PARAGRAFO":
      return (
        <Textarea
          id={id}
          rows={4}
          value={value?.text ?? ""}
          onChange={(e) => onChange({ questionId: question.id, text: e.target.value })}
        />
      );

    case "LISTA_SUSPENSA":
      return (
        <Select
          id={id}
          placeholder="Selecione"
          options={question.options.map((o) => ({ value: o.id, label: o.label }))}
          value={value?.optionIds?.[0] ?? ""}
          onChange={(e) => onChange({ questionId: question.id, optionIds: [e.target.value] })}
        />
      );

    case "MULTIPLA_ESCOLHA":
      return (
        <div role="radiogroup" aria-labelledby={id} className="space-y-2">
          {question.options.map((option) => (
            <label key={option.id} className="flex cursor-pointer items-center gap-3 text-sm">
              <input
                type="radio"
                name={id}
                checked={value?.optionIds?.[0] === option.id}
                onChange={() => onChange({ questionId: question.id, optionIds: [option.id] })}
                className="h-4 w-4 accent-accent"
              />
              <span className="text-foreground">{option.label}</span>
            </label>
          ))}
        </div>
      );

    case "CAIXAS_SELECAO":
      return (
        <div className="space-y-2">
          {question.options.map((option) => {
            const chosen = value?.optionIds ?? [];
            const checked = chosen.includes(option.id);
            return (
              <label key={option.id} className="flex cursor-pointer items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() =>
                    onChange({
                      questionId: question.id,
                      optionIds: checked
                        ? chosen.filter((c) => c !== option.id)
                        : [...chosen, option.id],
                    })
                  }
                  className="h-4 w-4 accent-accent"
                />
                <span className="text-foreground">{option.label}</span>
              </label>
            );
          })}
        </div>
      );

    default: {
      // ESCALA_LINEAR
      const min = question.scaleMin ?? 1;
      const max = question.scaleMax ?? 5;
      const values = Array.from({ length: max - min + 1 }, (_, i) => min + i);
      return (
        <div>
          <div
            role="radiogroup"
            aria-labelledby={id}
            // Mesma lição do formulário de avaliação: overflow-y-hidden evita
            // que o navegador materialize barra vertical, e o padding dá folga
            // para o anel do botão ativo não ser recortado.
            className="scrollbar-slim flex items-center gap-3 overflow-x-auto overflow-y-hidden px-0.5 py-1"
          >
            {values.map((v) => {
              const active = value?.number === v;
              return (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => onChange({ questionId: question.id, number: v })}
                  className={
                    "focus-ring flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 font-bold transition-all " +
                    (active
                      ? "border-accent bg-accent text-white shadow-md ring-2 ring-accent/40"
                      : "border-border bg-surface text-muted hover:border-accent/50 hover:text-foreground")
                  }
                >
                  {v}
                </button>
              );
            })}
          </div>
          {(question.scaleMinLabel || question.scaleMaxLabel) && (
            <div className="mt-1.5 flex justify-between text-xs text-muted">
              <span>{question.scaleMinLabel}</span>
              <span>{question.scaleMaxLabel}</span>
            </div>
          )}
        </div>
      );
    }
  }
}
