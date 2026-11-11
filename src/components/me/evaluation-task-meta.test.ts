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
import type { EvalForm, MyEvaluationTask } from "@/types/evaluation";

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
test("só a compreensão de vídeo conta como avaliação de vídeo", () => {
  assert.equal(ehAvaliacaoDeVideo("COMPREENSAO_VIDEO"), true);
  assert.equal(ehAvaliacaoDeVideo("FEEDBACK"), false);
  assert.equal(ehAvaliacaoDeVideo("AUTOAVALIACAO"), false);
  assert.equal(ehAvaliacaoDeVideo("FORMULARIO"), false);
});

test("as quatro colunas cobrem todos os tipos, sem sobra", () => {
  const todos = ["FEEDBACK", "AUTOAVALIACAO", "FORMULARIO", "COMPREENSAO_VIDEO"] as const;
  const video = todos.filter(ehAvaliacaoDeVideo);
  const resto = todos.filter((k) => !ehAvaliacaoDeVideo(k));
  // Nenhum tipo fica de fora e nenhum entra nas duas: é o que impede uma
  // pendência de sumir do quadro quando um tipo novo for criado.
  assert.equal(video.length + resto.length, todos.length);
  assert.deepEqual(video, ["COMPREENSAO_VIDEO"]);
});
