"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarClock,
  Image as ImageIcon,
  Inbox,
  Link2,
  Loader2,
  Plus,
  UserRound,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { excluirTarefa, moverTarefa } from "@/lib/weekly-report/actions";
import { TASK_STATUSES } from "@/lib/weekly-report/math";
import {
  TASK_CATEGORY_COLOR,
  TASK_CATEGORY_LABEL,
  TASK_PRIORITY_LABEL,
  TASK_STATUS_COLOR,
  TASK_STATUS_LABEL,
  evidenciaEhImagem,
  formatarDiaMes,
} from "@/lib/weekly-report/labels";
import type {
  KanbanSummary,
  MarketingTaskItem,
  MarketingTaskStatus,
  TaskPerson,
} from "@/types/weekly-report";
import { TaskModal } from "./task-modal";
import { TaskDetailsModal } from "./task-details-modal";

/**
 * O quadro das abas 7 e 8 da planilha, na estética do Cronograma.
 *
 * O cartão segue o card do calendário: moldura `rounded-lg border p-2`, título
 * em duas linhas no máximo e selos minúsculos. A coluna segue o quadro do
 * calendário — `rounded-xl border`, cabeçalho em `bg-surface-2`.
 *
 * A COR MARCA O STATUS, não a categoria: é o que a referência de 23/11/2026
 * mostrava, e faz mais sentido — a coluna já diz o status pela posição, e a
 * cor reforça a mesma leitura em vez de competir com ela.
 *
 * ARRASTAR move o cartão. É drag-and-drop NATIVO do HTML (`draggable`,
 * `onDragOver`, `onDrop`), sem biblioteca: o navegador já faz isso há vinte
 * anos, e uma dependência aqui pagaria por recursos que este quadro não usa
 * (reordenar dentro da coluna, animação de deslocamento, arrasto em toque).
 *
 * Arrastar é mouse. O caminho de quem usa teclado ou leitor de tela é o CLIQUE
 * — Enter no cartão abre a ficha, e lá o status é uma lista suspensa. Por isso
 * o cartão não tem mais botões próprios: eles viviam num alvo de 20 px dentro
 * de um cartão que agora inteiro é clicável, e a ficha faz as duas coisas
 * melhor.
 */

/** Selo minúsculo, o do Cronograma. */
function Selo({
  children,
  className,
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span
      style={style}
      className={cn(
        "rounded border px-1.5 py-0.5 text-[10px] font-semibold leading-none",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Prioridade: a cor acompanha a palavra, nunca a substitui. */
const PRIORITY_BADGE: Record<MarketingTaskItem["priority"], string> = {
  ALTA: "border-danger/35 bg-danger/15 text-danger",
  MEDIA: "border-warning/35 bg-warning/15 text-warning",
  BAIXA: "border-border bg-surface-3 text-muted",
};

/** Um número do topo do quadro. */
function Numero({
  rotulo,
  valor,
  destaque,
}: {
  rotulo: string;
  valor: number;
  destaque?: "primary" | "warning";
}) {
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-3">
      <p className="text-[11px] text-muted">{rotulo}</p>
      <p
        className={cn(
          "mt-1 text-2xl font-bold tracking-tight",
          destaque === "primary" && valor > 0 && "text-primary",
          destaque === "warning" && valor > 0 && "text-warning",
          (!destaque || valor === 0) && "text-foreground",
        )}
      >
        {valor}
      </p>
    </div>
  );
}

export function KanbanBoard({
  slug,
  tasks,
  summary,
  people,
  canEdit,
}: {
  slug: string;
  tasks: readonly MarketingTaskItem[];
  summary: KanbanSummary;
  people: readonly TaskPerson[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [novo, setNovo] = useState(false);
  const [abertoId, setAbertoId] = useState<string | null>(null);
  const [editando, setEditando] = useState<MarketingTaskItem | null>(null);
  const [excluindo, setExcluindo] = useState<MarketingTaskItem | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [arrastando, setArrastando] = useState<string | null>(null);
  // Cartão que acabou de mudar de coluna pelo teclado. Ele é destruído e
  // recriado dentro da coluna nova, e sem isto o foco cairia no corpo da
  // página a cada seta — a seta seguinte rolaria a página em vez de mover o
  // cartão. Em `ref`, e não em estado, porque reposicionar o foco não é
  // motivo para redesenhar o quadro.
  const foco = useRef<string | null>(null);
  const [alvo, setAlvo] = useState<MarketingTaskStatus | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  // A lista nova chega pelo `router.refresh()`, depois do commit em que o
  // cartão sai de uma coluna e nasce na outra; por isso o foco é devolvido
  // aqui, a cada troca de `tasks`, e não no `ref` do cartão.
  useEffect(() => {
    if (!foco.current) return;
    document.querySelector<HTMLElement>(`[data-cartao="${foco.current}"]`)?.focus();
  }, [tasks]);

  // O cartão aberto é buscado pela lista, não guardado em estado: assim ele
  // reflete o `router.refresh()` depois de uma edição, em vez de mostrar a
  // versão congelada no momento do clique.
  const aberto = tasks.find((t) => t.id === abertoId) ?? null;

  const contagemDe = (status: MarketingTaskStatus) =>
    summary.byStatus.find((l) => l.status === status)?.count ?? 0;

  async function mover(taskId: string, status: MarketingTaskStatus) {
    if (ocupado) return;
    setOcupado(taskId);
    setErro(null);
    const r = await moverTarefa({ slug, taskId, status });
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
    setAbertoId(null);
    router.refresh();
  }

  function soltarNaColuna(status: MarketingTaskStatus, e: React.DragEvent) {
    e.preventDefault();
    setAlvo(null);
    setArrastando(null);
    const id = e.dataTransfer.getData("text/plain");
    if (!id) return;
    const task = tasks.find((t) => t.id === id);
    if (!task || task.status === status) return;
    void mover(id, status);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted">
          Arraste os cartões da esquerda para a direita conforme a tarefa avança, ou clique para
          ver a ficha. Com o cartão em foco, ← e → movem entre as colunas. Nada chega a Publicado
          sem evidência.
        </p>
        {canEdit && (
          <Button size="sm" onClick={() => setNovo(true)}>
            <Plus className="h-3.5 w-3.5" />
            Nova tarefa
          </Button>
        )}
      </div>

      {/* Os números ACIMA do quadro, não depois dele: quem abre o Kanban na
          sexta quer o total e o atraso antes de olhar cartão por cartão. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <Numero rotulo="Total de tarefas" valor={summary.total} />
        <Numero rotulo="Em andamento" valor={contagemDe("EM_ANDAMENTO")} />
        <Numero rotulo="Em revisão" valor={contagemDe("REVISAO")} />
        <Numero rotulo="Publicadas" valor={summary.published} destaque="primary" />
        <Numero rotulo="Atrasadas" valor={summary.overdue} destaque="warning" />
      </div>

      {erro && <p className="text-xs text-danger">{erro}</p>}

      <div className="scrollbar-slim overflow-x-auto rounded-xl border border-border bg-surface">
        {/* A partir de `lg` as cinco colunas DIVIDEM a largura disponível
            (`flex-1`), e aí não há barra horizontal nenhuma. Abaixo disso elas
            voltam à largura fixa e o quadro rola de lado: cinco colunas num
            telefone não caberiam sem virar cinco tiras ilegíveis. */}
        <div className="flex min-w-max divide-x divide-border lg:min-w-0">
          {TASK_STATUSES.map((status) => {
            const coluna = tasks.filter((t) => t.status === status);
            const recebendo = alvo === status;
            return (
              <section
                key={status}
                aria-label={TASK_STATUS_LABEL[status]}
                className={cn(
                  "w-[248px] shrink-0 transition-colors lg:w-auto lg:min-w-0 lg:flex-1",
                  recebendo && "bg-primary/[0.07]",
                )}
                onDragOver={(e) => {
                  if (!canEdit || !arrastando) return;
                  // Sem o preventDefault o navegador recusa a soltura: o
                  // padrão de toda área da página é "aqui não se solta".
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  setAlvo(status);
                }}
                onDragLeave={(e) => {
                  // Só limpa ao sair da COLUNA: passar por cima de um cartão
                  // filho dispara dragleave e piscaria o destaque.
                  if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
                  setAlvo((atual) => (atual === status ? null : atual));
                }}
                onDrop={(e) => canEdit && soltarNaColuna(status, e)}
              >
                <header
                  className={cn(
                    "flex items-center gap-1.5 border-b border-border px-2.5 py-2 transition-colors",
                    recebendo ? "bg-primary/10" : "bg-surface-2",
                  )}
                >
                  <span
                    aria-hidden
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: TASK_STATUS_COLOR[status] }}
                  />
                  <h4 className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                    {TASK_STATUS_LABEL[status]}
                  </h4>
                  <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-md bg-surface-3 px-1 text-[11px] font-semibold text-muted">
                    {coluna.length}
                  </span>
                </header>

                {/* Cinco cartões e a coluna para de crescer — o resto rola
                    dentro dela. É altura fixa porque o CSS não sabe contar
                    filhos; a conta é 5 × ~112 px + os espaços.
                    shortcut: cartão muito mais alto que o normal (título de
                    duas linhas, prazo e evidência) mostra 4 em vez de 5; se o
                    cartão mudar de forma, refazer a conta. */}
                <div className="scrollbar-slim max-h-[600px] min-h-[120px] space-y-2 overflow-y-auto p-2">
                  {coluna.length === 0 ? (
                    <div
                      className={cn(
                        "flex flex-col items-center gap-1.5 rounded-lg border border-dashed px-2 py-6 text-center transition-colors",
                        recebendo ? "border-primary/50" : "border-border",
                      )}
                    >
                      <Inbox className="h-5 w-5 text-muted/60" aria-hidden />
                      <p className="text-[11px] leading-tight text-muted">
                        {recebendo
                          ? "Solte aqui"
                          : `Nenhuma tarefa em ${TASK_STATUS_LABEL[status].toLowerCase()}`}
                      </p>
                    </div>
                  ) : (
                    coluna.map((task) => (
                      <article
                        key={task.id}
                        /* Div com papel de botão, não `<button>`: o cartão tem
                           um link de evidência e selos dentro, e botão dentro
                           de botão é HTML inválido — a mesma armadilha do card
                           de vídeo e do atalho de aplicativo. */
                        role="button"
                        tabIndex={0}
                        data-cartao={task.id}
                        draggable={canEdit && ocupado === null}
                        onClick={() => {
                          foco.current = null;
                          setAbertoId(task.id);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setAbertoId(task.id);
                            return;
                          }
                          // Arrastar é mouse. Com o cartão em foco, as setas
                          // fazem o mesmo caminho pelo teclado — é o que a
                          // lista "Mover para" da ficha fazia antes de sair.
                          if (!canEdit) return;
                          const passo = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
                          if (passo === 0) return;
                          const destino = TASK_STATUSES[TASK_STATUSES.indexOf(status) + passo];
                          if (!destino) return;
                          e.preventDefault();
                          foco.current = task.id;
                          void mover(task.id, destino);
                        }}
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/plain", task.id);
                          e.dataTransfer.effectAllowed = "move";
                          setArrastando(task.id);
                        }}
                        onDragEnd={() => {
                          setArrastando(null);
                          setAlvo(null);
                        }}
                        className={cn(
                          "focus-ring rounded-lg border border-border bg-surface-2 p-3 text-left transition-all",
                          canEdit ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
                          "hover:border-border-strong",
                          arrastando === task.id && "opacity-40",
                          ocupado === task.id && "opacity-60",
                        )}
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-[11px] leading-none text-muted">
                            {task.code}
                          </span>
                          {ocupado === task.id && (
                            <Loader2 className="ml-auto h-3.5 w-3.5 animate-spin text-muted" />
                          )}
                        </div>

                        <p className="mt-1.5 line-clamp-2 text-sm font-semibold leading-snug text-foreground">
                          {task.title}
                        </p>

                        <div className="mt-2 flex items-center gap-1">
                          <Selo
                            className="border-transparent"
                            style={{
                              backgroundColor: `${TASK_CATEGORY_COLOR[task.category]}26`,
                              color: TASK_CATEGORY_COLOR[task.category],
                            }}
                          >
                            {TASK_CATEGORY_LABEL[task.category]}
                          </Selo>
                          <Selo className={PRIORITY_BADGE[task.priority]}>
                            {TASK_PRIORITY_LABEL[task.priority]}
                          </Selo>
                          {/* O rosto de quem toca a tarefa. Sem responsável,
                              o círculo fica vazio em vez de sumir: a fileira
                              de cartões alinha, e o vazio é a pergunta "de
                              quem é isto?". */}
                          {task.assignee ? (
                            <span className="ml-auto flex items-center" title={task.assignee.name}>
                              <Avatar
                                name={task.assignee.name}
                                avatarPath={task.assignee.avatarPath}
                                size="h-6 w-6"
                                textSize="text-[10px]"
                              />
                              {/* As iniciais não são um nome para quem ouve a
                                  tela; o nome inteiro vai aqui. */}
                              <span className="sr-only">
                                Responsável: {task.assignee.name}
                              </span>
                            </span>
                          ) : (
                            <span
                              aria-hidden
                              title="Sem responsável"
                              className="ml-auto flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-dashed border-border text-muted/70"
                            >
                              <UserRound className="h-3 w-3" />
                            </span>
                          )}
                        </div>

                        {(task.evidence || task.dueDate) && (
                          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
                            {task.evidence && (
                              <span className="inline-flex items-center gap-0.5 text-primary">
                                {evidenciaEhImagem(task.evidence) ? (
                                  <ImageIcon className="h-3 w-3" />
                                ) : (
                                  <Link2 className="h-3 w-3" />
                                )}
                                evidência
                              </span>
                            )}
                            {task.dueDate && (
                              <span
                                className={cn(
                                  "inline-flex items-center gap-0.5",
                                  task.overdue ? "font-semibold text-danger" : "text-muted",
                                )}
                              >
                                <CalendarClock className="h-3 w-3" />
                                {task.overdue && "atrasado · "}
                                {formatarDiaMes(task.dueDate)}
                              </span>
                            )}
                          </div>
                        )}
                      </article>
                    ))
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      {/* Legenda e a regra de auditoria, que era a frase da aba de instruções
          da planilha ("o board é auditado toda sexta, no bloco das 17h"). Com
          a aba "Como usar" fora, esta é a única linha que ainda a diz. */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border pt-2.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {TASK_STATUSES.map((status) => (
            <span key={status} className="flex items-center gap-1.5 text-[11px] text-muted">
              <span
                aria-hidden
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: TASK_STATUS_COLOR[status] }}
              />
              {TASK_STATUS_LABEL[status]}
            </span>
          ))}
        </div>
        <span className="flex items-center gap-1.5 text-[11px] text-muted">
          <CalendarClock className="h-3.5 w-3.5" aria-hidden />
          Auditoria do quadro: sexta, 17h
        </span>
      </div>

      {aberto && !editando && !excluindo && (
        <TaskDetailsModal
          task={aberto}
          canEdit={canEdit}
          onClose={() => setAbertoId(null)}
          onEdit={() => setEditando(aberto)}
          onDelete={() => setExcluindo(aberto)}
        />
      )}

      {/* A chave remonta o formulário a cada cartão: todo o estado dele vive em
          inicializadores de useState, e sem ela abrir o segundo cartão
          mostraria os dados do primeiro. */}
      {novo && (
        <TaskModal key="novo" slug={slug} open people={people} onClose={() => setNovo(false)} />
      )}
      {editando && (
        <TaskModal
          key={editando.id}
          slug={slug}
          open
          task={editando}
          people={people}
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
