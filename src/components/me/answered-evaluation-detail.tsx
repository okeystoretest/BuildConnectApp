"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { EvaluationResultView } from "@/components/hr/evaluation-result-view";
import { FormResponseView } from "@/components/me/form-response-view";
import { fetchMyEvaluationDetail, fetchMyFormResponse } from "@/lib/my-evaluations-history-actions";
import type { AnsweredEvaluation, EvaluationResultDetail } from "@/types/evaluation";
import type { FormResponseDetail } from "@/types/form";

/**
 * A devolutiva completa de uma submissão já respondida, aberta a partir do
 * card no quadro de "Minhas Avaliações".
 *
 * Ocupa o painel inteiro, e não um modal: é leitura longa (seções, critérios,
 * observações) e caberia mal numa janela sobreposta ao quadro. O caminho de
 * volta é explícito no topo.
 *
 * Busca ao abrir, e não junto da lista: carregar a devolutiva de todos os
 * registros a cada abertura da página pagaria por tudo o que ninguém vai ler.
 */
export function AnsweredEvaluationDetail({
  item,
  onBack,
}: {
  item: AnsweredEvaluation;
  onBack: () => void;
}) {
  const [evaluation, setEvaluation] = useState<EvaluationResultDetail | null>(null);
  const [form, setForm] = useState<FormResponseDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    if (item.kind === "FORMULARIO") {
      const res = await fetchMyFormResponse(item.id);
      if (res.ok && res.detail) setForm(res.detail);
      else setError(res.error ?? "Não foi possível abrir esta resposta.");
      return;
    }
    const res = await fetchMyEvaluationDetail(item.id);
    if (res.ok && res.detail) setEvaluation(res.detail);
    else setError(res.error ?? "Não foi possível abrir esta avaliação.");
  }, [item.id, item.kind]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="focus-ring inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-muted transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Voltar ao quadro
      </button>

      {error && <EmptyState title="Não foi possível abrir" description={error} />}
      {!error && !evaluation && !form && (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-border bg-surface py-16 text-sm text-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando suas respostas…
        </div>
      )}
      {evaluation && <EvaluationResultView detail={evaluation} />}
      {form && <FormResponseView detail={form} />}
    </div>
  );
}
