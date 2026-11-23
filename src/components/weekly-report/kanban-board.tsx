"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Link2, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { excluirTarefa, moverTarefa } from "@/lib/weekly-report/actions";
import { TASK_STATUSES } from "@/lib/weekly-report/math";
import {
  TASK_CATEGORY_LABEL,
  TASK_PRIORITY_LABEL,
  TASK_PRIORITY_TONE,
  TASK_STATUS_LABEL,
  formatarData,
} from "@/lib/weekly-report/labels";
import type { MarketingTaskItem, MarketingTaskStatus } from "@/types/weekly-report";
import { TaskModal } from "./task-modal";

/**
 * O quadro das abas 7 e 8 da planilha.
 *
 * As colunas não arrastam. O cartão troca de coluna por uma lista suspensa —
 * é o que funciona com teclado, com leitor de tela e no telefone, e arrastar
 * numa planilha também nunca existiu: movia-se a célula de status. Uma
 * biblioteca de drag-and-drop custaria uma dependência para desfazer as três
 * coisas.
 */
export function KanbanBoard({
  slug,
  tasks,
  canEdit,
}: {
  slug: string;
  tasks: readonly MarketingTaskItem[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [novo, setNovo] = useState(false);
  const [editando, setEditando] = useState<MarketingTaskItem | null>(null);
  const [excluindo, setExcluindo] = useState<MarketingTaskItem | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function mover(task: MarketingTaskItem, status: MarketingTaskStatus) {
    if (ocupado) return;
    setOcupado(task.id);
    setErro(null);
    const r = await moverTarefa({ slug, taskId: task.id, status });
    setOcupado(null);
    if (!r.ok) {
      setErro(r.error ?? "Não foi possível mover a tarefa.");
      return;
    }
    router.refresh();
  }

  async function remover() {
    if (!excluindo || ocupado) return;
    setOcupado(excluindo.id);
    setErro(null);
    const r = await excluirTarefa({ slug, taskId: excluindo.id });
    setOcupado(null);
    if (!r.ok) {
      setErro(r.error ?? "Não foi possível excluir a tarefa.");
      return;
    }
    setExcluindo(null);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted">
          Mova os cartões da esquerda para a direita conforme a tarefa avança. Nada chega a
          Publicado sem evidência.
        </p>
        {canEdit && (
          <Button size="sm" onClick={() => setNovo(true)}>
            <Plus className="h-3.5 w-3.5" />
            Nova tarefa
          </Button>
        )}
      </div>

      {erro && <p className="text-xs text-danger">{erro}</p>}

      <div className="scrollbar-slim -mx-1 overflow-x-auto px-1 pb-2">
        <div className="flex min-w-max gap-3">
          {TASK_STATUSES.map((status) => {
            const coluna = tasks.filter((t) => t.status === status);
            return (
              <section
                key={status}
                aria-label={TASK_STATUS_LABEL[status]}
                className="w-[260px] shrink-0 rounded-xl border border-border bg-surface-2/40 p-2"
              >
                <header className="flex items-center justify-between px-1 pb-2">
                  <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                    {TASK_STATUS_LABEL[status]}
                  </h4>
                  <span className="text-[11px] text-muted">{coluna.length}</span>
                </header>

                <div className="space-y-2">
                  {coluna.length === 0 && (
                    <p className="px-1 py-3 text-[11px] text-muted">Nenhum cartão.</p>
                  )}
                  {coluna.map((task) => (
                    <article
                      key={task.id}
                      className="rounded-lg border border-border bg-surface p-2.5"
                    >
                      <div className="flex items-start justify-between gap-1">
                        <span className="font-mono text-[10px] text-muted">{task.code}</span>
                        <div className="flex items-center gap-1">
                          <Badge tone={TASK_PRIORITY_TONE[task.priority]} className="text-[10px]">
                            {TASK_PRIORITY_LABEL[task.priority]}
                          </Badge>
                          {canEdit && (
                            <>
                              <button
                                type="button"
                                onClick={() => setEditando(task)}
                                aria-label={`Editar ${task.code}`}
                                className="focus-ring flex h-6 w-6 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
                              >
                                <Pencil className="h-3 w-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setExcluindo(task)}
                                aria-label={`Excluir ${task.code}`}
                                className="focus-ring flex h-6 w-6 items-center justify-center rounded-md text-danger transition-colors hover:bg-danger/15"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      <p className="mt-1 text-xs text-foreground">{task.title}</p>

                      <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted">
                        <span>{TASK_CATEGORY_LABEL[task.category]}</span>
                        {task.assignee && <span>· {task.assignee}</span>}
                        {task.evidence && (
                          <span className="inline-flex items-center gap-0.5 text-primary">
                            <Link2 className="h-3 w-3" />
                            evidência
                          </span>
                        )}
                      </p>

                      {task.dueDate && (
                        <p
                          className={`mt-1 inline-flex items-center gap-1 text-[10px] ${
                            task.overdue ? "font-semibold text-danger" : "text-muted"
                          }`}
                        >
                          <CalendarClock className="h-3 w-3" />
                          {task.overdue ? "atrasado · " : ""}
                          {formatarData(task.dueDate)}
                        </p>
                      )}

                      {canEdit && (
                        <div className="mt-2 flex items-center gap-1.5">
                          <Select
                            aria-label={`Mover ${task.code}`}
                            className="h-8 text-[11px]"
                            disabled={ocupado === task.id}
                            value={task.status}
                            onChange={(e) =>
                              mover(task, e.target.value as MarketingTaskStatus)
                            }
                            options={TASK_STATUSES.map((s) => ({
                              value: s,
                              label: TASK_STATUS_LABEL[s],
                            }))}
                          />
                          {ocupado === task.id && (
                            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted" />
                          )}
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      {/* A chave remonta o modal a cada cartão: todo o estado dele vive em
          inicializadores de useState, e sem ela abrir o segundo cartão
          mostraria os dados do primeiro. */}
      {novo && <TaskModal key="novo" slug={slug} open onClose={() => setNovo(false)} />}
      {editando && (
        <TaskModal
          key={editando.id}
          slug={slug}
          open
          task={editando}
          onClose={() => setEditando(null)}
        />
      )}

      <Modal
        open={excluindo !== null}
        onClose={() => {
          if (!ocupado) setExcluindo(null);
        }}
        title="Excluir tarefa"
        description="O cartão sai do quadro permanentemente."
        className="max-w-md"
        footer={
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => setExcluindo(null)}
              disabled={ocupado !== null}
            >
              Cancelar
            </Button>
            <Button variant="danger" onClick={remover} disabled={ocupado !== null}>
              {ocupado !== null && <Loader2 className="h-4 w-4 animate-spin" />}
              Excluir
            </Button>
          </div>
        }
      >
        <p className="p-6 text-sm text-muted">
          Confirma a exclusão de{" "}
          <span className="font-semibold text-foreground">
            {excluindo?.code} — {excluindo?.title}
          </span>
          ? Esta ação não pode ser desfeita.
        </p>
      </Modal>
    </div>
  );
}
