"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  EyeOff,
  FileText,
  Loader2,
  Lock,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { FormDashboard } from "@/components/forms/form-dashboard";
import {
  closeForm,
  createForm,
  deleteForm,
  fetchFormResults,
  reopenForm,
} from "@/lib/forms/actions";
import { useToast } from "@/providers/toast-provider";
import { FORM_STATUS_LABEL } from "@/types/form";
import type { FormListItem } from "@/types/form";
import type { FormResults } from "@/lib/forms/data";

/** A palavra que destrava a exclusão com respostas. Igual à do servidor. */
const DELETE_WORD = "APAGAR";

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
  /** Formulário na fila para exclusão, e a palavra digitada até agora. */
  const [pendingDelete, setPendingDelete] = useState<FormListItem | null>(null);
  const [typed, setTyped] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [busy, startAction] = useTransition();

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

  function openResults(formId: string, round?: number) {
    setOpeningId(formId);
    startAction(async () => {
      const res = await fetchFormResults(formId, round);
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

  function handleReopen(formId: string) {
    setClosingId(formId);
    startAction(async () => {
      const res = await reopenForm(formId);
      setClosingId(null);
      if (res.ok) {
        success("Formulário reaberto — começou uma rodada nova");
        router.refresh();
      } else {
        error(res.error ?? "Não foi possível reabrir o formulário.");
      }
    });
  }

  function askDelete(form: FormListItem) {
    setPendingDelete(form);
    setTyped("");
    setDeleteError(null);
  }

  function confirmDelete() {
    if (!pendingDelete) return;
    setDeleteError(null);
    startAction(async () => {
      const res = await deleteForm({
        formId: pendingDelete.id,
        confirmation: typed.trim() || undefined,
      });
      if (res.ok) {
        setPendingDelete(null);
        success("Formulário excluído");
        router.refresh();
      } else {
        setDeleteError(res.error ?? "Não foi possível excluir.");
      }
    });
  }

  // O servidor é quem exige a palavra; a tela só espelha, para o botão não
  // ficar habilitado prometendo algo que será recusado.
  const needsWord = (pendingDelete?.responseCount ?? 0) > 0;

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
        <FormDashboard
          data={results}
          loading={busy}
          // Cada rodada é uma consulta nova: agregar no cliente exigiria trazer
          // todas as respostas de todas as rodadas para escolher uma.
          onSelectRound={(round) => openResults(results.form.id, round)}
        />
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
                {form.status === "ENCERRADO" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleReopen(form.id)}
                    disabled={closingId === form.id}
                    title="Reabrir começa uma rodada nova; as respostas anteriores ficam guardadas."
                  >
                    <RotateCcw className="h-4 w-4" />
                    {closingId === form.id ? "Reabrindo" : "Reabrir"}
                  </Button>
                )}
                <Button variant="danger" size="sm" onClick={() => askDelete(form)}>
                  <Trash2 className="h-4 w-4" />
                  Excluir
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Excluir é definitivo: o cascade leva seções, perguntas, opções,
          atribuições e respostas. Quando há resposta, o freio é digitado —
          proporcional ao estrago, e o servidor exige o mesmo, não só a tela. */}
      <Modal
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        title="Excluir formulário"
        description="Some para todo mundo, com tudo que foi respondido. Não tem volta."
        className="max-w-md"
        dismissible={!busy}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setPendingDelete(null)} disabled={busy}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              onClick={confirmDelete}
              disabled={busy || (needsWord && typed.trim() !== DELETE_WORD)}
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {busy ? "Excluindo" : "Excluir"}
            </Button>
          </div>
        }
      >
        <div className="p-6">
          <p className="text-sm text-muted">
            Confirma a exclusão de{" "}
            <span className="font-semibold text-foreground">{pendingDelete?.title}</span>?
          </p>

          {needsWord && (
            <div className="mt-4">
              <p className="mb-2 flex items-start gap-2 text-sm text-warning">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Este formulário tem {pendingDelete?.responseCount} resposta(s), que serão
                  apagadas junto.
                </span>
              </p>
              <label htmlFor="confirma-exclusao" className="mb-1.5 block text-xs text-muted">
                Digite <span className="font-semibold text-foreground">{DELETE_WORD}</span> para
                confirmar
              </label>
              <Input
                id="confirma-exclusao"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={DELETE_WORD}
                autoComplete="off"
              />
            </div>
          )}

          {deleteError && <p className="mt-3 text-xs text-danger">{deleteError}</p>}
        </div>
      </Modal>
    </div>
  );
}
