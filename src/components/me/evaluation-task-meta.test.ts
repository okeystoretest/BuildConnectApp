import assert from "node:assert/strict";
import test from "node:test";
import {
  ehAvaliacaoDeVideo,
  taskAction,
  taskDetail,
  taskHeadline,
  taskIconTone,
  taskKey,
  taskTone,
} from "./evaluation-task-meta";
import type { AnsweredEvaluationKind, EvalForm, MyEvaluationTask } from "@/types/evaluation";

function task(over: Partial<MyEvaluationTask> = {}): MyEvaluationTask {
  return {
    kind: "FEEDBACK",
    roundId: "r1",
    typeSlug: "eficacia-no-trabalho",
    typeTitle: "Eficácia no Trabalho",
    subjectName: "Ana",
    self: false,
    ...over,
  };
}

const FORM = {} as EvalForm;

test("feedback nomeia quem será avaliado; autoavaliação não", () => {
  assert.equal(taskHeadline(task()), "Avaliar Ana");
  assert.equal(taskHeadline(task({ kind: "AUTOAVALIACAO", self: true })), "Sua autoavaliação");
});

test("formulário do DHO mostra o próprio título, sem 'Avaliar'", () => {
  assert.equal(
    taskHeadline(task({ kind: "FORMULARIO", formId: "f1", subjectName: "Pesquisa de clima" })),
    "Pesquisa de clima",
  );
});

test("a compreensão diz de qual vídeo é a resposta", () => {
  const t = task({
    kind: "COMPREENSAO_VIDEO",
    typeTitle: "Compreensão de vídeo",
    comprehension: {
      comprehensionId: "c1",
      authorName: "Bruno",
      videoTitle: "Abertura de caixa",
      answer: "…",
      submittedAtLabel: "01/11/2026",
    },
  });
  assert.equal(taskDetail(t), "Compreensão de vídeo · Abertura de caixa");
  // Sem a resposta anexada sobra o instrumento, nunca um " · " solto.
  assert.equal(taskDetail(task({ kind: "COMPREENSAO_VIDEO" })), "Eficácia no Trabalho");
});

test("o tom segue a autoria, não o instrumento", () => {
  assert.equal(taskTone(task({ self: true })), "primary");
  assert.equal(taskTone(task({ self: false })), "accent");
  assert.match(taskIconTone(task({ self: true })), /primary/);
  assert.match(taskIconTone(task({ self: false })), /accent/);
});

test("compreensão de vídeo nunca espera carregamento", () => {
  assert.deepEqual(taskAction(task({ kind: "COMPREENSAO_VIDEO" }), {}, null), {
    label: "Avaliar",
    disabled: false,
  });
});

test("formulário desabilita só enquanto busca a própria estrutura", () => {
  const t = task({ kind: "FORMULARIO", formId: "f1" });
  assert.deepEqual(taskAction(t, {}, "f1"), { label: "Abrindo", disabled: true });
  assert.deepEqual(taskAction(t, {}, "outro"), { label: "Responder", disabled: false });
});

test("rodada só habilita com o instrumento carregado", () => {
  assert.equal(taskAction(task(), {}, null).disabled, true);
  assert.equal(taskAction(task(), { "eficacia-no-trabalho": FORM }, null).disabled, false);
});

/*
 * O caso que esta chave existe para impedir: formulário e compreensão não
 * usam `roundId`, então sem o id próprio as duas cairiam na MESMA key e o
 * React reaproveitaria o card errado.
 */
test("a chave distingue tarefas que compartilham o roundId", () => {
  const form = task({ kind: "FORMULARIO", roundId: "", formId: "f1" });
  const comp = task({
    kind: "COMPREENSAO_VIDEO",
    roundId: "",
    comprehension: {
      comprehensionId: "c1",
      authorName: "Bruno",
      videoTitle: "V",
      answer: "…",
      submittedAtLabel: "01/11/2026",
    },
  });
  assert.notEqual(taskKey(form), taskKey(comp));
  assert.equal(taskKey(form), "FORMULARIO-f1");
  assert.equal(taskKey(comp), "COMPREENSAO_VIDEO-c1");
});

/*
 * A régua das QUATRO colunas do quadro. O caso que importa é o formulário do
 * DHO: ele não é 360° nem vídeo, e precisa cair do lado não-vídeo — fora do
 * quadro ele viraria uma pendência que ninguém vê.
 */
/**
 * Todos os tipos, derivados do TIPO e não escritos à mão.
 *
 * O `Record` da união obriga o compilador a cobrar cada membro novo aqui.
 * Antes isto era um array literal, e por isso a rede não pegava nada: nascia
 * um tipo, o array continuava com os quatro antigos e o teste seguia verde
 * sem cobrir o novo — o acidente exato que ele deveria impedir. Quem
 * acrescentar um tipo agora não compila até decidir de que lado ele cai.
 */
const TODOS: Record<AnsweredEvaluationKind, true> = {
  FEEDBACK: true,
  AUTOAVALIACAO: true,
  PRE_EFETIVO: true,
  FORMULARIO: true,
  COMPREENSAO_VIDEO: true,
};
const todos = Object.keys(TODOS) as AnsweredEvaluationKind[];

test("só a compreensão de vídeo conta como avaliação de vídeo", () => {
  assert.equal(ehAvaliacaoDeVideo("COMPREENSAO_VIDEO"), true);
  assert.equal(ehAvaliacaoDeVideo("FEEDBACK"), false);
  assert.equal(ehAvaliacaoDeVideo("AUTOAVALIACAO"), false);
  assert.equal(ehAvaliacaoDeVideo("PRE_EFETIVO"), false);
  assert.equal(ehAvaliacaoDeVideo("FORMULARIO"), false);
});

test("os dois escopos cobrem todos os tipos, sem sobra", () => {
  const video = todos.filter(ehAvaliacaoDeVideo);
  const resto = todos.filter((k) => !ehAvaliacaoDeVideo(k));
  // Nenhum tipo fica de fora e nenhum entra nos dois: é o que impede uma
  // pendência de sumir do quadro quando um tipo novo for criado.
  assert.equal(video.length + resto.length, todos.length);
  assert.deepEqual(video, ["COMPREENSAO_VIDEO"]);
  // O Pré-Efetivo é avaliação interna: cai no escopo não-vídeo.
  assert.ok(resto.includes("PRE_EFETIVO"));
});

test("o Pré-Efetivo diz o ciclo e desde quando está aberto", () => {
  const t = task({
    kind: "PRE_EFETIVO",
    roundId: "",
    subjectId: "u1",
    cycle: 2,
    availableAtLabel: "03/11/2026",
    typeSlug: "acompanhamento-pre-efetivo",
    typeTitle: "Acompanhamento Funcional Pré-Efetivo",
  });
  assert.equal(taskHeadline(t), "Avaliar Ana");
  assert.equal(
    taskDetail(t),
    "Acompanhamento Funcional Pré-Efetivo · ciclo 2 · disponível desde 03/11/2026",
  );
});

test("dois ciclos do mesmo colaborador têm chaves diferentes", () => {
  // Sem isto os dois colidiriam na chave (`roundId` vazio) e o React
  // reaproveitaria o card errado ao reordenar a fila.
  const c1 = task({ kind: "PRE_EFETIVO", roundId: "", subjectId: "u1", cycle: 1 });
  const c2 = task({ kind: "PRE_EFETIVO", roundId: "", subjectId: "u1", cycle: 2 });
  assert.notEqual(taskKey(c1), taskKey(c2));
});
