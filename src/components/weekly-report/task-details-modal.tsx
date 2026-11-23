"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, ExternalLink, Loader2, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { moverTarefa } from "@/lib/weekly-report/actions";
import { TASK_STATUSES } from "@/lib/weekly-report/math";
import {
  TASK_CATEGORY_COLOR,
  TASK_CATEGORY_LABEL,
  TASK_PRIORITY_LABEL,
  TASK_STATUS_COLOR,
  TASK_STATUS_LABEL,
  evidenciaEhImagem,
  formatarData,
  formatarDataHora,
} from "@/lib/weekly-report/labels";
import type { MarketingTaskItem, MarketingTaskStatus } from "@/types/weekly-report";

/**
 * Tudo que se sabe sobre um cartão, ao clicar nele.
 *
 * O cartão do quadro mostra o mínimo para caber em 232 px; o resto — prazo,
 * entrada, responsável, observação inteira, a imagem da evidência — mora aqui.
 * Segue o `post-details-modal` do Cronograma: LER é o estado padrão, e editar
 * é um botão que abre o formulário.
 *
 * É também o caminho ACESSÍVEL de mover o cartão. O quadro move por arrasto,
 * que é mouse; aqui o status é uma lista suspensa, alcançável por teclado e
 * por leitor de tela. Sem isto, arrastar teria tirado a função de quem não
 * usa mouse.
 */

/** Um par rótulo/valor da ficha. */
function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-muted">{rotulo}</p>
      <div className="mt-0.5 text-sm text-foreground">{children}</div>
    </div>
  );
}

export function TaskDetailsModal({
  slug,
  task,
  canEdit,
  onClose,
  onEdit,
  onDelete,
}: {
  slug: string;
  task: MarketingTaskItem;
  canEdit: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const router = useRouter();
  const [movendo, setMovendo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function mover(status: MarketingTaskStatus) {
    if (movendo) return;
    setMovendo(true);
    setErro(null);
    const r = await moverTarefa({ slug, taskId: task.id, status });
    setMovendo(false);
    if (!r.ok) {
      setErro(r.error ?? "Não foi possível mover a tarefa.");
      return;
    }
    router.refresh();
    onClose();
  }

  return (
    <Modal
      open
      onClose={movendo ? undefined : onClose}
      title={`${task.code} — ${task.title}`}
      className="max-w-xl"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {canEdit && (
              <>
                <Button variant="secondary" size="sm" onClick={onEdit} disabled={movendo}>
                  <Pencil className="h-3.5 w-3.5" />
                  Editar
                </Button>
                <Button variant="danger" size="sm" onClick={onDelete} disabled={movendo}>
                  <Trash2 className="h-3.5 w-3.5" />
                  Excluir
                </Button>
              </>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={movendo}>
            Fechar
          </Button>
        </div>
      }
    >
      <div className="space-y-4 p-6">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="rounded border border-transparent px-1.5 py-0.5 text-[10px] font-semibold"
            style={{
              backgroundColor: `${TASK_CATEGORY_COLOR[task.category]}26`,
              color: TASK_CATEGORY_COLOR[task.category],
            }}
          >
            {TASK_CATEGORY_LABEL[task.category]}
          </span>
          <span
            className={cn(
              "rounded border px-1.5 py-0.5 text-[10px] font-semibold",
              task.priority === "ALTA"
                ? "border-danger/35 bg-danger/15 text-danger"
                : task.priority === "MEDIA"
                  ? "border-warning/35 bg-warning/15 text-warning"
                  : "border-border bg-surface-3 text-muted",
            )}
          >
            Prioridade {TASK_PRIORITY_LABEL[task.priority]}
          </span>
          <span className="flex items-center gap-1.5 text-[11px] text-muted">
            <span
              aria-hidden
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: TASK_STATUS_COLOR[task.status] }}
            />
            {TASK_STATUS_LABEL[task.status]}
          </span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Responsável">
            {task.assignee ? (
              <span className="flex items-center gap-2">
                <Avatar name={task.assignee} size="h-6 w-6" textSize="text-[10px]" />
                {task.assignee}
              </span>
            ) : (
              <span className="text-muted">—</span>
            )}
          </Campo>

          <Campo rotulo="Prazo">
            {task.dueDate ? (
              <span
                className={cn(
                  "inline-flex items-center gap-1.5",
                  task.overdue && "font-semibold text-danger",
                )}
              >
                <CalendarClock className="h-3.5 w-3.5" aria-hidden />
                {formatarData(task.dueDate)}
                {task.overdue && " · atrasado"}
              </span>
            ) : (
              <span className="text-muted">sem prazo</span>
            )}
          </Campo>

          <Campo rotulo="Entrou no quadro">{formatarData(task.enteredAt)}</Campo>

          <Campo rotulo="Publicado em">
            {task.doneAt ? formatarDataHora(task.doneAt) : <span className="text-muted">—</span>}
          </Campo>
        </div>

        <Campo rotulo="Evidência">
          {!task.evidence ? (
            <span className="text-muted">
              Nenhuma. É ela que libera o cartão para Publicado.
            </span>
          ) : evidenciaEhImagem(task.evidence) ? (
            <a href={task.evidence} target="_blank" rel="noreferrer" className="focus-ring block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={task.evidence}
                alt={`Evidência de ${task.code}`}
                className="max-h-64 w-full rounded-xl border border-border bg-surface-2 object-contain"
              />
            </a>
          ) : (
            <a
              href={task.evidence}
              target="_blank"
              rel="noreferrer"
              className="focus-ring inline-flex max-w-full items-center gap-1.5 break-all text-primary hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {task.evidence}
            </a>
          )}
        </Campo>

        <Campo rotulo="Observação">
          {task.note ? (
            <p className="whitespace-pre-wrap">{task.note}</p>
          ) : (
            <span className="text-muted">—</span>
          )}
        </Campo>

        {canEdit && (
          <div className="space-y-1.5 border-t border-border pt-4">
            <p className="text-[11px] uppercase tracking-wide text-muted">Mover para</p>
            <div className="flex items-center gap-2">
              <Select
                aria-label={`Mover ${task.code}`}
                className="h-10"
                disabled={movendo}
                value={task.status}
                onChange={(e) => mover(e.target.value as MarketingTaskStatus)}
                options={TASK_STATUSES.map((s) => ({ value: s, label: TASK_STATUS_LABEL[s] }))}
              />
              {movendo && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted" />}
            </div>
            <p className="text-[11px] text-muted">
              No quadro, dá para arrastar o cartão entre as colunas.
            </p>
          </div>
        )}

        {erro && <p className="text-xs text-danger">{erro}</p>}
      </div>
    </Modal>
  );
}
