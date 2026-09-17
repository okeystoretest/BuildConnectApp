import assert from "node:assert/strict";
import test from "node:test";
import {
  addInterval,
  isComplete,
  watchedSeconds,
  COMPLETION_RATIO,
  type Interval,
} from "./video-watch";

test("intervalos separados somam sem se misturar", () => {
  let list: Interval[] = [];
  list = addInterval(list, 0, 10);
  list = addInterval(list, 20, 30);
  assert.deepEqual(list, [
    [0, 10],
    [20, 30],
  ]);
  assert.equal(watchedSeconds(list), 20);
});

test("intervalo sobreposto funde com o vizinho — rever um trecho não conta duas vezes", () => {
  let list: Interval[] = [[0, 10]];
  list = addInterval(list, 5, 15);
  assert.deepEqual(list, [[0, 15]]);
  assert.equal(watchedSeconds(list), 15);
});

test("intervalo contíguo também funde", () => {
  let list: Interval[] = [[0, 10]];
  list = addInterval(list, 10, 12);
  assert.deepEqual(list, [[0, 12]]);
});

test("um intervalo que cobre vários fecha o buraco entre eles", () => {
  let list: Interval[] = [
    [0, 5],
    [10, 15],
    [20, 25],
  ];
  list = addInterval(list, 4, 21);
  assert.deepEqual(list, [[0, 25]]);
});

test("voltar no vídeo e assistir de novo não aumenta o total", () => {
  let list: Interval[] = [[0, 30]];
  list = addInterval(list, 10, 20);
  assert.equal(watchedSeconds(list), 30);
});

test("intervalo vazio ou invertido é ignorado", () => {
  assert.deepEqual(addInterval([], 5, 5), []);
  assert.deepEqual(addInterval([], 9, 5), []);
  assert.deepEqual(addInterval([], Number.NaN, 5), []);
});

test("addInterval não muta a lista original", () => {
  const original: Interval[] = [[0, 10]];
  addInterval(original, 5, 20);
  assert.deepEqual(original, [[0, 10]]);
});

test("conclui aos 80 % da duração, com um segundo de folga para o fim", () => {
  assert.equal(COMPLETION_RATIO, 0.8);
  assert.equal(isComplete(79, 100), false);
  assert.equal(isComplete(80, 100), true);
  assert.equal(isComplete(100, 100), true);
  // Vídeo de 10 s: 8 s bastam.
  assert.equal(isComplete(7.9, 10), false);
  assert.equal(isComplete(8, 10), true);
});

test("duração desconhecida ou zero nunca conclui", () => {
  assert.equal(isComplete(50, 0), false);
  assert.equal(isComplete(50, Number.NaN), false);
  assert.equal(isComplete(50, Number.POSITIVE_INFINITY), false);
});
