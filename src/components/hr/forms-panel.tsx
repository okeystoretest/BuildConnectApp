"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, BarChart3, EyeOff, FileText, Loader2, Lock, Pencil, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FormDashboard } from "@/components/forms/form-dashboard";
import { closeForm, createForm, fetchFormResults } from "@/lib/forms/actions";
import { useToast } from "@/providers/toast-provider";
import { FORM_STATUS_LABEL } from "@/types/form";
import type { FormListItem } from "@/types/form";
import type { FormResults } from "@/lib/forms/data";

export interface FormsPanelProps {
  forms: readonly FormListItem[];
}

/**
 * Bloco "Formulários" do DHO: a listagem e a porta para o construtor e para o
 * dashboard de resultados.
 *
 * A lista já chega recortada por setor (`getFormsForViewer`) — o gestor de
 * outro setor não RECEBE o formulário, em vez de recebê-lo e não ver.
 */
export function FormsPanel({ forms }: FormsPanelProps) {
  const router = useRouter();
  const { success, error } = useToast();
  const [creating, startCreate] = useTransition();
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [results, setResults] = useState<FormResults | null>(null);
  const [closingId, setClosingId] = useState<string | null>(null);
  const [, startAction] = useTransition();

  function handleCreate() {
    startCreate(async () => {
      const res = await createForm();
      if (res.ok && res.id) {
        router.push(`/setores/rh/formularios/${res.id}`);
      } else {
        error(res.error ?? "Não foi possível criar o formulário.");
      }
    });
  }

  function openResults(formId: string) {
    setOpeningId(formId);
    startAction(async () => {
      const res = await fetchFormResults(formId);
      setOpeningId(null);
      if (!res) {
        error("Não foi possível carregar os resultados.");
        return;
      }
      setResults(res);
    });
  }

  function handleClose(formId: string) {
    setClosingId(formId);
    startAction(async () => {
      const res = await closeForm(formId);
      setClosingId(null);
      if (res.ok) {
        success("Formulário encerrado");
        router.refresh();
      } else {
        error(res.error ?? "Não foi possível encerrar o formulário.");
      }
    });
  }

  if (results) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => setResults(null)}
          className="focus-ring inline-flex items-center gap-2 rounded-lg text-sm text-muted transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar aos formulários
        </button>
        <h3 className="text-xl font-bold text-foreground">{results.form.title}</h3>
        <FormDashboard data={results} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          Formulários criados pelo DHO. Publique para um setor ou para pessoas específicas.
        </p>
        <Button onClick={handleCreate} disabled={creating}>
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          {creating ? "Criando" : "Criar formulário"}
        </Button>
      </div>

      {forms.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-5 w-5" />}
          title="Nenhum formulário ainda"
          description="Crie o primeiro formulário para coletar respostas da equipe."
        />
      ) : (
        <div className="space-y-3">
          {forms.map((form) => (
            <div
              key={form.id}
              className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
                  <FileText className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">{form.title}</p>
                  <p className="text-xs text-muted">
                    Criado em {form.createdAtLabel} · {form.responseCount} de {form.assignedCount}{" "}
                    responderam
                  </p>
                </div>
              </div>

              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {form.anonymous && (
                  <Badge tone="info">
                    <EyeOff className="mr-1 h-3 w-3" />
                    Anônimo
                  </Badge>
                )}
                <Badge tone={form.status === "PUBLICADO" ? "accent" : "neutral"}>
                  {FORM_STATUS_LABEL[form.status]}
                </Badge>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => router.push(`/setores/rh/formularios/${form.id}`)}
                >
                  <Pencil className="h-4 w-4" />
                  Abrir
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => openResults(form.id)}
                  disabled={openingId === form.id}
                >
                  <BarChart3 className="h-4 w-4" />
                  {openingId === form.id ? "Abrindo" : "Resultados"}
                </Button>
                {form.status === "PUBLICADO" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleClose(form.id)}
                    disabled={closingId === form.id}
                  >
                    <Lock className="h-4 w-4" />
                    {closingId === form.id ? "Encerrando" : "Encerrar"}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
