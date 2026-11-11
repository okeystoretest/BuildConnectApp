import { test } from "node:test";
import assert from "node:assert/strict";
import { correctSubmission, isPassing, scoreLabel, scoreOf } from "./grade";

/** Questionário de 5 perguntas, a correta sempre na posição que se diz. */
function quiz(total: number) {
  return Array.from({ length: total }, (_, i) => ({
    id: `q${i}`,
    options: [
      { id: `q${i}-a`, correct: false },
      { id: `q${i}-b`, correct: true },
      { id: `q${i}-c`, correct: false },
    ],
  }));
}

/** Marca as `acertos` primeiras certas e erra o resto. */
function respostas(total: number, acertos: number): Map<string, string> {
  const m = new Map<string, string>();
  for (let i = 0; i < total; i += 1) m.set(`q${i}`, i < acertos ? `q${i}-b` : `q${i}-a`);
  return m;
}

// ─── A regra que o DHO definiu ─────────────────────────────────────────────

test("com 5 perguntas: 0 erros aprova com 10, 1 erro aprova com 8, 2 erros reprovam com 6", () => {
  assert.equal(scoreLabel(5, 5), "10,0");
  assert.equal(isPassing(5, 5), true);

  assert.equal(scoreLabel(4, 5), "8,0");
  assert.equal(isPassing(4, 5), true);

  assert.equal(scoreLabel(3, 5), "6,0");
  assert.equal(isPassing(3, 5), false);
});

/**
 * O piso é 7, não "duas erradas". Com outra quantidade de perguntas a conta
 * tem de seguir sozinha — é por isso que o número 2 não está no código.
 */
test("o piso vale para qualquer quantidade de perguntas", () => {
  // 4 perguntas: 1 erro = 7,5, ainda aprova.
  assert.equal(scoreLabel(3, 4), "7,5");
  assert.equal(isPassing(3, 4), true);
  // 3 perguntas: 1 erro = 6,7, já reprova.
  assert.equal(isPassing(2, 3), false);
  // Exatamente 7,0 aprova: o piso é inclusivo.
  assert.equal(scoreOf(7, 10), 7);
  assert.equal(isPassing(7, 10), true);
});

test("sem perguntas a nota é 0, e não aprova por vacuidade", () => {
  assert.equal(scoreOf(0, 0), 0);
  assert.equal(isPassing(0, 0), false);
});

test("acertos impossíveis não inflam a nota", () => {
  assert.equal(scoreOf(9, 5), 10);
  assert.equal(scoreOf(-3, 5), 0);
});

// ─── Correção contra o gabarito ────────────────────────────────────────────

test("corrige contra o gabarito e devolve a contagem", () => {
  const q = quiz(5);
  assert.deepEqual(correctSubmission(q, respostas(5, 5)), {
    correctCount: 5,
    totalCount: 5,
    passed: true,
  });
  assert.deepEqual(correctSubmission(q, respostas(5, 4)), {
    correctCount: 4,
    totalCount: 5,
    passed: true,
  });
  assert.deepEqual(correctSubmission(q, respostas(5, 3)), {
    correctCount: 3,
    totalCount: 5,
    passed: false,
  });
});

test("pergunta em branco conta como erro, nunca como anulada", () => {
  const q = quiz(5);
  // Quatro certas e a quinta sem resposta: 4/5 = 8,0, ainda aprova.
  const parcial = respostas(5, 4);
  parcial.delete("q4");
  assert.deepEqual(correctSubmission(q, parcial), {
    correctCount: 4,
    totalCount: 5,
    passed: true,
  });

  // Nada respondido: zero, e não "sem nota".
  assert.deepEqual(correctSubmission(q, new Map()), {
    correctCount: 0,
    totalCount: 5,
    passed: false,
  });
});

test("marcar uma opção que não é da pergunta não vira acerto", () => {
  const q = quiz(2);
  const forjado = new Map([
    ["q0", "q1-b"], // a correta DA OUTRA pergunta
    ["q1", "inexistente"],
  ]);
  assert.deepEqual(correctSubmission(q, forjado), {
    correctCount: 0,
    totalCount: 2,
    passed: false,
  });
});

test("a ordem das perguntas não muda a correção", () => {
  const q = quiz(5);
  const invertido = [...q].reverse();
  assert.deepEqual(
    correctSubmission(invertido, respostas(5, 4)),
    correctSubmission(q, respostas(5, 4)),
  );
});
