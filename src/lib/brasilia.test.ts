import assert from "node:assert/strict";
import test from "node:test";
import { dateLabelBR, dayMonthBR, isoDateBR, timeLabelBR, daysAgoBR } from "./brasilia";

/**
 * 02:30Z de 14/09 é 23:30 de 13/09 em Brasília — o instante muda de DIA ao
 * atravessar o fuso, então qualquer rótulo que ainda dependa do fuso do
 * servidor erra hora E data aqui. Rode também com TZ=UTC: o resultado tem de
 * ser o mesmo.
 */
const INSTANT = new Date("2026-09-14T02:30:00.000Z");

test("hora e data saem em Brasília, seja qual for o fuso do processo", () => {
  assert.equal(timeLabelBR(INSTANT), "23:30");
  assert.equal(dateLabelBR(INSTANT), "13/09/2026");
  assert.equal(dayMonthBR(INSTANT), "13/09");
  assert.equal(isoDateBR(INSTANT), "2026-09-13");
});

test("meia-noite de Brasília não vira o dia anterior nem o seguinte", () => {
  assert.equal(dateLabelBR(new Date("2026-09-14T03:00:00.000Z")), "14/09/2026");
  assert.equal(timeLabelBR(new Date("2026-09-14T03:00:00.000Z")), "00:00");
});

test("dias decorridos contam dias de calendário em Brasília, não blocos de 24h", () => {
  const now = new Date("2026-09-14T03:30:00.000Z"); // 00:30 de 14/09 em Brasília
  assert.equal(daysAgoBR(new Date("2026-09-14T03:10:00.000Z"), now), 0); // 00:10 do mesmo dia
  assert.equal(daysAgoBR(new Date("2026-09-14T02:50:00.000Z"), now), 1); // 23:50 de ontem
  assert.equal(daysAgoBR(new Date("2026-09-10T12:00:00.000Z"), now), 4);
});
