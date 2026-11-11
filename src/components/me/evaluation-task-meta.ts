import type { AnsweredEvaluationKind, EvalForm, MyEvaluationTask } from "@/types/evaluation";

/**
 * Rótulos derivados de uma pendência de avaliação.
 *
 * Mora fora dos componentes porque as DUAS visualizações de "Minhas
 * Avaliações" — a lista e o quadro — mostram a mesma pendência. Com a lógica
 * repetida em cada uma, bastaria um ajuste de texto numa delas para a mesma
 * tarefa aparecer com nomes diferentes dependendo do botão que a pessoa
 * apertou. O mapa de ícone e tom por tipo vem de `evaluation-kind-meta`,
 * que é onde ele já existia.
 */

/** Primeira linha do card: de quem é a avaliação. */
export function taskHeadline(task: MyEvaluationTask): string {
  if (task.kind === "FORMULARIO") return task.subjectName;
  return task.self ? "Sua autoavaliação" : `Avaliar ${task.subjectName}`;
}

/** Segunda linha: o instrumento e, na compreensão, de qual vídeo. */
export function taskDetail(task: MyEvaluationTask): string {
  if (task.kind === "COMPREENSAO_VIDEO" && task.comprehension) {
    return `${task.typeTitle} · ${task.comprehension.videoTitle}`;
  }
  /*
   * O Pré-Efetivo diz o ciclo e desde quando está aberto: três ciclos do
   * mesmo instrumento sobre a mesma pessoa sairiam como três cards idênticos,
   * e a data é o que dá a ordem de urgência da fila.
   */
  if (task.kind === "PRE_EFETIVO") {
    const ciclo = task.cycle != null ? ` · ciclo ${task.cycle}` : "";
    const desde = task.availableAtLabel ? ` · disponível desde ${task.availableAtLabel}` : "";
    return `${task.typeTitle}${ciclo}${desde}`;
  }
  return task.typeTitle;
}

/**
 * Tom do selo e do ícone. É a AUTORIA que decide, não o instrumento: o que a
 * pessoa precisa distinguir de relance é "isto é sobre mim" de "isto é sobre
 * outra pessoa".
 */
export function taskTone(task: MyEvaluationTask): "primary" | "accent" {
  return task.self ? "primary" : "accent";
}

/** Classe do círculo do ícone, no mesmo tom do selo. */
export function taskIconTone(task: MyEvaluationTask): string {
  return task.self ? "bg-primary/15 text-primary" : "bg-accent/15 text-accent";
}

/**
 * Botão da pendência.
 *
 * A compreensão de vídeo nunca espera nada: a resposta a avaliar já veio com
 * a tarefa. O formulário do DHO chega sem estrutura (seria carregar todo
 * formulário de todo mundo a cada abertura da página), então ele desabilita
 * enquanto busca. A rodada depende do instrumento ter sido carregado.
 */
export function taskAction(
  task: MyEvaluationTask,
  forms: Record<string, EvalForm>,
  loadingFormId: string | null,
): { label: string; disabled: boolean } {
  if (task.kind === "COMPREENSAO_VIDEO") return { label: "Avaliar", disabled: false };
  if (task.kind === "FORMULARIO") {
    const loading = loadingFormId === task.formId;
    return { label: loading ? "Abrindo" : "Responder", disabled: loading };
  }
  return { label: "Preencher", disabled: !forms[task.typeSlug] };
}

/**
 * Chave estável de uma pendência, para a `key` do React.
 *
 * Os três tipos guardam o id em campos diferentes, e um `roundId` vazio
 * (formulário e compreensão usam o próprio id) faria duas tarefas colidirem na
 * mesma chave — e o React reaproveitaria o card errado ao reordenar a lista.
 */
export function taskKey(task: MyEvaluationTask): string {
  /*
   * O Pré-Efetivo não tem rodada: o alvo é a tripla colaborador + ciclo. Sem
   * esta linha, dois ciclos disponíveis cairiam na mesma chave (`roundId`
   * vazio) e o React reaproveitaria o card errado ao reordenar a fila — que é
   * exatamente o acidente que esta função existe para evitar.
   */
  if (task.kind === "PRE_EFETIVO") {
    return `${task.kind}-${task.subjectId ?? ""}-${task.cycle ?? ""}`;
  }
  return `${task.kind}-${task.formId ?? task.comprehension?.comprehensionId ?? task.roundId}`;
}

/**
 * A avaliação é de VÍDEO (compreensão de uma Instrução em Vídeo)?
 *
 * É a régua que decide a coluna no quadro de "Minhas Avaliações": vídeo de um
 * lado, todo o resto do outro. Vale para pendência e para concluída porque
 * `MyEvaluationTask.kind` e `AnsweredEvaluationKind` são a mesma união — se
 * deixassem de ser, o compilador cobra aqui, num lugar só.
 *
 * O formulário do DHO cai no lado NÃO-vídeo de propósito: ele não é 360°, mas
 * tirá-lo do quadro o tornaria uma pendência invisível para quem usa só o
 * quadro — e pendência que não aparece é a que ninguém responde. O selo do
 * card continua dizendo "Formulário".
 */
export function ehAvaliacaoDeVideo(kind: AnsweredEvaluationKind): boolean {
  return kind === "COMPREENSAO_VIDEO";
}
