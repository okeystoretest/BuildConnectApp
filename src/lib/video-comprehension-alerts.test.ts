import assert from "node:assert/strict";
import test from "node:test";
import { graderQueueAlert, isStale, ALERT_EVERY, STALE_DAYS } from "./video-comprehension-alerts";

const DAY = 24 * 60 * 60 * 1000;

test("os patamares são de 5 em 5 e a varredura olha 3 dias", () => {
  assert.equal(ALERT_EVERY, 5);
  assert.equal(STALE_DAYS, 3);
});

test("avisa ao chegar no quinto e não repete enquanto a fila fica no mesmo patamar", () => {
  assert.deepEqual(graderQueueAlert(5, 0), { notify: true, lastNotified: 5 });
  assert.deepEqual(graderQueueAlert(6, 5), { notify: false, lastNotified: 5 });
  assert.deepEqual(graderQueueAlert(9, 5), { notify: false, lastNotified: 5 });
});

test("avisa de novo no décimo", () => {
  assert.deepEqual(graderQueueAlert(10, 5), { notify: true, lastNotified: 10 });
});

test("um salto de 4 para 6 não perde o gatilho", () => {
  assert.deepEqual(graderQueueAlert(4, 0), { notify: false, lastNotified: 0 });
  assert.deepEqual(graderQueueAlert(6, 0), { notify: true, lastNotified: 5 });
});

test("a fila que encolhe rearma o patamar", () => {
  assert.deepEqual(graderQueueAlert(3, 5), { notify: false, lastNotified: 0 });
  assert.deepEqual(graderQueueAlert(7, 10), { notify: false, lastNotified: 5 });
});

test("fila vazia não avisa e zera o patamar", () => {
  assert.deepEqual(graderQueueAlert(0, 10), { notify: false, lastNotified: 0 });
});

test("resposta parada há 3 dias entra na varredura, uma vez só", () => {
  const now = new Date("2026-09-22T12:00:00Z");
  const old = new Date(now.getTime() - 3 * DAY);
  const recent = new Date(now.getTime() - 2 * DAY);

  assert.equal(isStale(old, null, now), true);
  assert.equal(isStale(recent, null, now), false);
  assert.equal(isStale(old, new Date("2026-09-21T00:00:00Z"), now), false);
});
