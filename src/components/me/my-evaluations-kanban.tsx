"use client";

import { ClipboardList, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCardListLimit } from "@/components/ui/use-card-list-limit";
import { ICON_TONE, KIND } from "@/components/me/evaluation-kind-meta";
import {
  ehAvaliacaoDeVideo,
  taskAction,
  taskDetail,
  taskHeadline,
  taskIconTone,
  taskKey,
  taskTone,
} from "@/components/me/evaluation-task-meta";
import type { AnsweredEvaluation, EvalForm, MyEvaluationTask } from "@/types/evaluation";

/** Cards à vista antes de a coluna rolar — o mesmo do quadro de chamados. */
const VISIBLE_CARDS = 3;

/** Qual escopo de avaliações o quadro está mostrando. */
export type EvaluationScope = "internas" | "videos";

export interface MyEvaluationsKanbanProps {
  scope: EvaluationScope;
  tasks: readonly MyEvaluationTask[];
  answered: readonly AnsweredEvaluation[];
  forms: Record<string, EvalForm>;
  loadingFormId: string | null;
  onStart: (task: MyEvaluationTask) => void;
  /** Abre o detalhe de uma concluída. Compreensão não chama: ver `AnsweredCard`. */
  onOpenAnswered: (item: AnsweredEvaluation) => void;
}

/**
 * Quadro de "Minhas Avaliações": DUAS colunas — pendentes e concluídas — do
 * escopo escolhido no alternador.
 *
 * O escopo é a régua de `ehAvaliacaoDeVideo`: de um lado a compreensão de
 * Instrução em Vídeo, do outro todo o resto (360°, autoavaliação e o
 * formulário do DHO). São assuntos diferentes — avaliar uma PESSOA e dar nota
 * a uma RESPOSTA — e misturá-los numa fila só obrigava a pessoa a separar com
 * o olho o que o sistema já sabe separar.
 *
 * Duas colunas e não quatro porque o escopo já recortou metade: com quatro, a
 * coluna ficava estreita demais e todo texto do card terminava em reticências,
 * que é o oposto de mostrar mais informação.
 *
 * Somente-leitura quanto à POSIÇÃO: ninguém arrasta card entre as colunas. Uma
 * pendência vira concluída respondendo a avaliação, nunca movendo o card — e
 * aceitar o arrasto prometeria um atalho que não existe.
 */
export function MyEvaluationsKanban({
  scope,
  tasks,
  answered,
  forms,
  loadingFormId,
  onStart,
  onOpenAnswered,
}: MyEvaluationsKanbanProps) {
  const video = scope === "videos";
  const pendentes = tasks.filter((t) => ehAvaliacaoDeVideo(t.kind) === video);
  const concluidas = answered.filter((a) => ehAvaliacaoDeVideo(a.kind) === video);

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <Column
        label="Pendentes"
        fullLabel={video ? "Respostas de vídeo a avaliar" : "Avaliações internas pendentes"}
        dot="bg-warning"
        count={pendentes.length}
        empty={video ? "Nenhuma resposta a avaliar" : "Nenhuma pendência"}
      >
        {pendentes.map((task) => (
          <PendingCard
            key={taskKey(task)}
            task={task}
            forms={forms}
            loadingFormId={loadingFormId}
            onStart={onStart}
          />
        ))}
      </Column>

      <Column
        label="Concluídas"
        fullLabel={video ? "Notas de vídeo já dadas" : "Avaliações internas concluídas"}
        dot="bg-primary"
        count={concluidas.length}
        empty={video ? "Nenhuma nota dada ainda" : "Nada respondido ainda"}
      >
        {concluidas.map((item) => (
          <AnsweredCard
            key={`${item.kind}-${item.id}`}
            item={item}
            onOpen={() => onOpenAnswered(item)}
          />
        ))}
      </Column>
    </div>
  );
}

/** A coluna, com a mesma geometria do quadro de chamados. */
function Column({
  label,
  fullLabel,
  dot,
  count,
  empty,
  children,
}: {
  label: string;
  /**
   * Nome por extenso para o leitor de tela e para o `title`: "Pendentes"
   * sozinho não diz de que escopo é, e o escopo está no alternador, longe da
   * coluna.
   */
  fullLabel: string;
  dot: string;
  count: number;
  empty: string;
  children: React.ReactNode;
}) {
  /*
   * Altura medida, não fixa em pixels: o card de avaliação cresce com o texto
   * (título que quebra em duas linhas, bloco de comentário da compreensão), e
   * um teto em `rem` cortaria o terceiro card no meio em umas telas e deixaria
   * um vão em outras. É o mesmo cálculo do quadro de chamados.
   */
  const { ref: listRef, maxHeight } = useCardListLimit(VISIBLE_CARDS, count);

  return (
    <section
      className="flex min-w-0 flex-col rounded-xl border border-border bg-surface-2/40 p-3"
      aria-label={`Coluna ${fullLabel}`}
    >
      <header className="mb-3 flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2 text-xs font-semibold text-foreground">
          <span className={cn("h-2 w-2 shrink-0 rounded-full", dot)} aria-hidden />
          <span className="truncate" title={fullLabel}>
            {label}
          </span>
        </span>
        <span className="shrink-0 text-xs text-muted">{count}</span>
      </header>

      <div
        ref={listRef}
        className="scrollbar-slim flex-1 space-y-3 overflow-y-auto pr-0.5"
        style={maxHeight !== undefined ? { maxHeight } : undefined}
      >
        {count === 0 ? (
          <p className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-8 text-center text-xs text-muted">
            <ClipboardList className="h-4 w-4" aria-hidden />
            {empty}
          </p>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

/**
 * Card de pendência: o mesmo texto e o mesmo botão da lista.
 *
 * Nada trunca, como no card de chamado: a coluna é larga (são duas, não
 * quatro) e o nome de quem será avaliado é a informação que a pessoa procura —
 * cortá-lo em reticências é esconder justamente isso.
 */
function PendingCard({
  task,
  forms,
  loadingFormId,
  onStart,
}: {
  task: MyEvaluationTask;
  forms: Record<string, EvalForm>;
  loadingFormId: string | null;
  onStart: (task: MyEvaluationTask) => void;
}) {
  const action = taskAction(task, forms, loadingFormId);

  return (
    <article className="rounded-xl border border-border bg-surface p-3.5">
      <div className="flex items-start gap-2.5">
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
            taskIconTone(task),
          )}
        >
          {KIND[task.kind].icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm font-semibold leading-snug text-foreground">
            {taskHeadline(task)}
          </p>
          <p className="mt-0.5 break-words text-xs text-muted">{taskDetail(task)}</p>
        </div>
      </div>

      {/* O botão numa linha própria: ao lado do texto, ele empurraria o nome do
          avaliado para três caracteres e reticências. */}
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-2.5">
        <Badge tone={taskTone(task)}>{KIND[task.kind].label}</Badge>
        <Button size="sm" onClick={() => onStart(task)} disabled={action.disabled}>
          {action.label}
        </Button>
      </div>
    </article>
  );
}

/**
 * Card de concluída: registro, não ação.
 *
 * Traz o que a lista trazia — hora, nota e, na compreensão, o bloco com a nota
 * que você deu e o seu comentário. Cabe porque a coluna é larga, e é o que o
 * card tem a acrescentar: sem isso, "Compreensão · 9/10" obrigava a abrir algo
 * para saber a quem a nota foi dada e por quê.
 *
 * Compreensão NÃO abre detalhe: a nota e o comentário já estão aqui, e um
 * clique para revelar duas frases é um clique cobrado à toa.
 */
function AnsweredCard({ item, onOpen }: { item: AnsweredEvaluation; onOpen: () => void }) {
  const openable = item.kind !== "COMPREENSAO_VIDEO";

  return (
    <article className="rounded-xl border border-border bg-surface p-3.5">
      <div className="flex items-start gap-2.5">
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
            ICON_TONE[item.kind],
          )}
        >
          {KIND[item.kind].icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm font-semibold leading-snug text-foreground">
            {item.title}
          </p>
          <p className="mt-0.5 break-words text-xs text-muted">
            {item.subjectName ? `${item.subjectName} · ` : ""}
            {item.answeredAtLabel} às {item.answeredAtTimeLabel}
          </p>
        </div>
      </div>

      {item.comprehension && (
        <div
          className={cn(
            "mt-3 rounded-lg border p-3",
            item.comprehension.passed
              ? "border-border bg-surface-2"
              : "border-warning/50 bg-warning/10",
          )}
        >
          <p className="break-words text-xs text-foreground">
            Você deu{" "}
            <span className={cn("font-semibold", !item.comprehension.passed && "text-warning")}>
              {item.comprehension.grade}/10
            </span>{" "}
            à resposta de {item.comprehension.authorName} —{" "}
            {item.comprehension.passed ? "aprovada" : "reprovada, o vídeo voltou a pendente"}.
          </p>
          {item.comprehension.comment && (
            <p className="mt-1.5 break-words text-xs text-muted">
              <span className="font-medium text-foreground">Seu comentário:</span>{" "}
              {item.comprehension.comment}
            </p>
          )}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-2.5">
        <Badge tone={KIND[item.kind].tone}>{KIND[item.kind].label}</Badge>
        <span className="flex items-center gap-3">
          {item.scoreLabel && (
            <span className="text-sm font-semibold text-foreground">{item.scoreLabel}</span>
          )}
          {openable && (
            <button
              type="button"
              onClick={onOpen}
              className="focus-ring flex items-center gap-1 rounded-md bg-surface-2 px-2 py-1 text-[10px] text-muted transition-colors hover:text-foreground"
            >
              <Eye className="h-3 w-3" aria-hidden />
              Ver respostas
            </button>
          )}
        </span>
      </div>
    </article>
  );
}
