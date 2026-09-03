"use client";

import { ArrowDown, ArrowUp, Copy, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  KINDS_WITH_OPTIONS,
  QUESTION_KIND_LABEL,
  QUESTION_KIND_ORDER,
  SCALE_MAX_CHOICES,
  SCALE_MIN_CHOICES,
} from "@/types/form";
import type { FormOptionDraft, FormQuestionDraft, FormQuestionKind } from "@/types/form";

export interface QuestionEditorProps {
  question: FormQuestionDraft;
  /** Numeração exibida (1-based, contínua entre seções). */
  index: number;
  onChange: (patch: Partial<FormQuestionDraft>) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  /** Formulário já respondido: estrutura travada. */
  disabled: boolean;
}

function newOption(order: number): FormOptionDraft {
  return { id: crypto.randomUUID(), label: `Opção ${order + 1}`, order };
}

/**
 * Edição de uma pergunta.
 *
 * Reordenação por botões ↑/↓, e não por arrastar: teclado e leitor de tela
 * funcionam de graça. O drag pode entrar depois sem tocar no modelo de dados,
 * que é uma lista com `order`.
 */
export function QuestionEditor({
  question,
  index,
  onChange,
  onDuplicate,
  onDelete,
  onMoveUp,
  onMoveDown,
  disabled,
}: QuestionEditorProps) {
  const hasOptions = KINDS_WITH_OPTIONS.includes(question.kind);
  const isScale = question.kind === "ESCALA_LINEAR";

  /**
   * Troca de tipo preserva o que é comum a todos — enunciado, ajuda e
   * obrigatoriedade. Só o que é específico do tipo antigo se perde, porque não
   * teria como sobreviver: opções não significam nada numa escala.
   */
  function changeKind(kind: FormQuestionKind) {
    const willHaveOptions = KINDS_WITH_OPTIONS.includes(kind);
    onChange({
      kind,
      options: willHaveOptions
        ? question.options.length > 0
          ? question.options
          : [newOption(0)]
        : [],
      scaleMin: kind === "ESCALA_LINEAR" ? (question.scaleMin ?? 1) : undefined,
      scaleMax: kind === "ESCALA_LINEAR" ? (question.scaleMax ?? 5) : undefined,
      scaleMinLabel: kind === "ESCALA_LINEAR" ? question.scaleMinLabel : undefined,
      scaleMaxLabel: kind === "ESCALA_LINEAR" ? question.scaleMaxLabel : undefined,
    });
  }

  function setOption(optionId: string, label: string) {
    onChange({
      options: question.options.map((o) => (o.id === optionId ? { ...o, label } : o)),
    });
  }

  function addOption() {
    onChange({ options: [...question.options, newOption(question.options.length)] });
  }

  function removeOption(optionId: string) {
    onChange({
      options: question.options
        .filter((o) => o.id !== optionId)
        .map((o, i) => ({ ...o, order: i })),
    });
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <span className="mt-2.5 shrink-0 text-sm font-semibold text-muted">{index}.</span>
        <div className="min-w-0 flex-1">
          <Input
            value={question.label}
            onChange={(e) => onChange({ label: e.target.value })}
            placeholder="Pergunta sem título"
            aria-label={`Enunciado da pergunta ${index}`}
            disabled={disabled}
            className="h-11 rounded-xl text-base font-medium"
          />
          <Input
            value={question.helpText ?? ""}
            onChange={(e) => onChange({ helpText: e.target.value })}
            placeholder="Texto de ajuda (opcional)"
            aria-label={`Texto de ajuda da pergunta ${index}`}
            disabled={disabled}
            className="mt-2 text-sm"
          />
        </div>
        <div className="w-full sm:w-56">
          <Select
            value={question.kind}
            onChange={(e) => changeKind(e.target.value as FormQuestionKind)}
            aria-label={`Tipo da pergunta ${index}`}
            disabled={disabled}
            options={QUESTION_KIND_ORDER.map((k) => ({
              value: k,
              label: QUESTION_KIND_LABEL[k],
            }))}
          />
        </div>
      </div>

      {hasOptions && (
        <div className="mt-4 space-y-2 sm:pl-7">
          {question.options.map((option) => (
            <div key={option.id} className="flex items-center gap-2">
              <Input
                value={option.label}
                onChange={(e) => setOption(option.id, e.target.value)}
                aria-label="Rótulo da opção"
                disabled={disabled}
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeOption(option.id)}
                aria-label={`Remover opção ${option.label}`}
                disabled={disabled || question.options.length <= 1}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button variant="ghost" size="sm" onClick={addOption} disabled={disabled}>
            <Plus className="h-4 w-4" />
            Adicionar opção
          </Button>
        </div>
      )}

      {isScale && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 sm:pl-7">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted">Mínimo</label>
            <Select
              value={String(question.scaleMin ?? 1)}
              onChange={(e) => onChange({ scaleMin: Number(e.target.value) })}
              aria-label="Valor mínimo da escala"
              disabled={disabled}
              options={SCALE_MIN_CHOICES.map((n) => String(n))}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted">Máximo</label>
            <Select
              value={String(question.scaleMax ?? 5)}
              onChange={(e) => onChange({ scaleMax: Number(e.target.value) })}
              aria-label="Valor máximo da escala"
              disabled={disabled}
              options={SCALE_MAX_CHOICES.map((n) => String(n))}
            />
          </div>
          <Input
            value={question.scaleMinLabel ?? ""}
            onChange={(e) => onChange({ scaleMinLabel: e.target.value })}
            placeholder="Rótulo do mínimo (opcional)"
            aria-label="Rótulo do valor mínimo"
            disabled={disabled}
          />
          <Input
            value={question.scaleMaxLabel ?? ""}
            onChange={(e) => onChange({ scaleMaxLabel: e.target.value })}
            placeholder="Rótulo do máximo (opcional)"
            aria-label="Rótulo do valor máximo"
            disabled={disabled}
          />
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3 sm:pl-7">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={question.required}
            onChange={(e) => onChange({ required: e.target.checked })}
            disabled={disabled}
            className="h-4 w-4 accent-accent"
          />
          Obrigatória
        </label>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={onMoveUp}
            aria-label="Mover pergunta para cima"
            disabled={disabled}
          >
            <ArrowUp className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onMoveDown}
            aria-label="Mover pergunta para baixo"
            disabled={disabled}
          >
            <ArrowDown className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onDuplicate}
            aria-label="Duplicar pergunta"
            disabled={disabled}
          >
            <Copy className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onDelete}
            aria-label="Excluir pergunta"
            disabled={disabled}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
