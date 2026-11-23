"use client";

import {
  CalendarClock,
  CalendarDays,
  Clock,
  ExternalLink,
  Pencil,
  Trash2,
  User as UserIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
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
import type { MarketingTaskItem } from "@/types/weekly-report";

/**
 * Tudo que se sabe sobre um cartão, ao clicar nele.
 *
 * É o `post-details-modal` do Cronograma aplicado ao quadro: mesma moldura
 * (`max-w-lg`, com o cabeçalho escrito dentro do corpo), mesma fileira de
 * selos em maiúsculas, mesmas caixas de campo (`rounded-lg border bg-surface-2
 * p-3`) com rótulo minúsculo e ícone, e o mesmo rodapé de botões de 44 px.
 * Duas ferramentas que abrem "a ficha de uma atividade" não podem abrir fichas
 * com desenhos diferentes.
 *
 * Aqui só se LÊ. Mover o cartão é trabalho do quadro — arrastando, ou com as
 * setas do teclado sobre o cartão em foco. A lista "Mover para" que morava
 * aqui saiu em 23/11/2026: duas portas para a mesma ação, e a ficha é onde se
 * confere a atividade, não onde se opera o quadro.
 */

/** Caixa de campo — a `Field` do Cronograma. */
function Campo({
  icone,
  rotulo,
  children,
}: {
  icone: React.ReactNode;
  rotulo: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface-2 p-3">
      <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
        {icone}
        {rotulo}
      </p>
      <div className="mt-1.5 text-sm text-foreground">{children}</div>
    </div>
  );
}

export function TaskDetailsModal({
  task,
  canEdit,
  onClose,
  onEdit,
  onDelete,
}: {
  task: MarketingTaskItem;
  canEdit: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <Modal
      open
      onClose={onClose}
      ariaLabel={`${task.code} — ${task.title}`}
      className="max-w-lg"
    >
      <div className="p-6">
        {/* Cabeçalho: código, título e status, como no Cronograma. */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
              Detalhes da atividade · <span className="font-mono">{task.code}</span>
            </p>
            <h2 className="mt-1 break-words text-lg font-semibold text-foreground">
              {task.title}
            </h2>
          </div>
          <span
            className="inline-flex shrink-0 items-center gap-1.5 rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
            style={{
              backgroundColor: `${TASK_STATUS_COLOR[task.status]}1f`,
              borderColor: `${TASK_STATUS_COLOR[task.status]}59`,
              color: TASK_STATUS_COLOR[task.status],
            }}
          >
            <span
              aria-hidden
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: TASK_STATUS_COLOR[task.status] }}
            />
            {TASK_STATUS_LABEL[task.status]}
          </span>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span
            className="rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
            style={{
              backgroundColor: `${TASK_CATEGORY_COLOR[task.category]}26`,
              borderColor: `${TASK_CATEGORY_COLOR[task.category]}59`,
              color: TASK_CATEGORY_COLOR[task.category],
            }}
          >
            {TASK_CATEGORY_LABEL[task.category]}
          </span>
          <span
            className={cn(
              "rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
              task.priority === "ALTA"
                ? "border-danger/35 bg-danger/15 text-danger"
                : task.priority === "MEDIA"
                  ? "border-warning/35 bg-warning/15 text-warning"
                  : "border-border bg-surface-3 text-muted",
            )}
          >
            Prioridade {TASK_PRIORITY_LABEL[task.priority]}
          </span>
          {task.overdue && (
            <span className="inline-flex items-center gap-1 rounded border border-danger/35 bg-danger/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-danger">
              <CalendarClock className="h-3 w-3" />
              Atrasado
            </span>
          )}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Campo icone={<UserIcon className="h-3 w-3" />} rotulo="Responsável">
            {task.assignee ? (
              <span className="flex items-center gap-2">
                <Avatar
                  name={task.assignee.name}
                  avatarPath={task.assignee.avatarPath}
                  size="h-6 w-6"
                  textSize="text-[10px]"
                />
                <span className="truncate">{task.assignee.name}</span>
              </span>
            ) : (
              <span className="text-muted">Sem responsável</span>
            )}
          </Campo>

          <Campo icone={<CalendarClock className="h-3 w-3" />} rotulo="Prazo">
            {task.dueDate ? (
              <span className={cn(task.overdue && "font-semibold text-danger")}>
                {formatarData(task.dueDate)}
              </span>
            ) : (
              <span className="text-muted">Sem prazo</span>
            )}
          </Campo>

          <Campo icone={<CalendarDays className="h-3 w-3" />} rotulo="Entrou no quadro">
            {formatarData(task.enteredAt)}
          </Campo>

          <Campo icone={<Clock className="h-3 w-3" />} rotulo="Publicado em">
            {task.doneAt ? formatarDataHora(task.doneAt) : <span className="text-muted">—</span>}
          </Campo>
        </div>

        <div className="mt-3 rounded-lg border border-border bg-surface-2 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Evidência</p>
          {!task.evidence ? (
            <p className="mt-1.5 text-sm text-muted">
              Nenhuma. É ela que libera o cartão para Publicado.
            </p>
          ) : evidenciaEhImagem(task.evidence) ? (
            <a
              href={task.evidence}
              target="_blank"
              rel="noreferrer"
              className="focus-ring mt-1.5 block"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={task.evidence}
                alt={`Evidência de ${task.code}`}
                className="max-h-64 w-full rounded-lg border border-border bg-surface object-contain"
              />
            </a>
          ) : (
            <a
              href={task.evidence}
              target="_blank"
              rel="noreferrer"
              className="focus-ring mt-1.5 inline-flex max-w-full items-center gap-1.5 break-all text-sm text-primary hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {task.evidence}
            </a>
          )}
        </div>

        <div className="mt-3 rounded-lg border border-border bg-surface-2 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Observação</p>
          {task.note ? (
            <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
              {task.note}
            </p>
          ) : (
            <p className="mt-1.5 text-sm text-muted">Nenhuma observação registrada.</p>
          )}
        </div>

        <div className="mt-6 flex items-center justify-between gap-3">
          {canEdit ? (
            <Button variant="secondary" onClick={onDelete} className="h-11 text-danger">
              <Trash2 className="h-4 w-4" />
              Excluir
            </Button>
          ) : (
            <span />
          )}

          <div className="flex gap-3">
            <Button variant="secondary" onClick={onClose} className="h-11">
              Fechar
            </Button>
            {canEdit && (
              <Button onClick={onEdit} className="h-11">
                <Pencil className="h-4 w-4" />
                Editar
              </Button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
