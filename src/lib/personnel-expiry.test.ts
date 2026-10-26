import assert from "node:assert/strict";
import test from "node:test";
import {
  EXPIRY_WARNING_DAYS,
  dayLabel,
  daysUntil,
  folderStatus,
  folderStatusLabel,
  isoDay,
  parseDay,
  personStatus,
  todayBR,
} from "./personnel-expiry";

const TODAY = "2026-10-23";

test("pasta vazia é pendente, com ou sem vencimento marcado", () => {
  assert.equal(folderStatus(false, null, TODAY), "pendente");
  assert.equal(folderStatus(false, "2026-10-24", TODAY), "pendente");
});

test("pasta entregue sem vencimento está sempre ok", () => {
  assert.equal(folderStatus(true, null, TODAY), "ok");
});

test("vence hoje é cuidado; venceu ontem é vencido", () => {
  assert.equal(folderStatus(true, TODAY, TODAY), "cuidado");
  assert.equal(folderStatus(true, "2026-10-22", TODAY), "vencido");
});

test("a janela de cuidado fecha no último dia, não no seguinte", () => {
  assert.equal(folderStatus(true, "2026-11-22", TODAY), "cuidado"); // 30 dias
  assert.equal(folderStatus(true, "2026-11-23", TODAY), "ok"); // 31
  assert.equal(daysUntil("2026-11-22", TODAY), EXPIRY_WARNING_DAYS);
});

test("o estado da pessoa é o pior das pastas, e pendente ganha de vencido", () => {
  assert.equal(personStatus([]), "ok");
  assert.equal(personStatus(["ok", "ok"]), "ok");
  assert.equal(personStatus(["ok", "cuidado"]), "cuidado");
  assert.equal(personStatus(["cuidado", "vencido"]), "vencido");
  assert.equal(personStatus(["vencido", "pendente"]), "pendente");
});

test("isoDay lê a coluna DATE pelo calendário UTC", () => {
  // Meia-noite UTC do dia 1º: lido em Brasília seria dia 30.
  assert.equal(isoDay(new Date("2026-12-01T00:00:00Z")), "2026-12-01");
});

test("todayBR usa o calendário de Brasília, não o do processo", () => {
  // 02:30 UTC do dia 24 ainda é dia 23 em Brasília (UTC-3).
  assert.equal(todayBR(new Date("2026-10-24T02:30:00Z")), "2026-10-23");
});

test("parseDay recusa o que não é dia de calendário", () => {
  assert.equal(parseDay(" 2026-10-23 "), "2026-10-23");
  assert.equal(parseDay("2026-02-31"), null);
  assert.equal(parseDay("23/10/2026"), null);
  assert.equal(parseDay(""), null);
});

test("dayLabel escreve na ordem que se lê em português", () => {
  assert.equal(dayLabel("2026-10-23"), "23/10/2026");
});

test("folderStatusLabel diz a palavra do estado, e a data só quando há o que vencer", () => {
  // Pendente não ganha data mesmo com vencimento gravado: a pasta está vazia.
  assert.equal(folderStatusLabel("pendente", "2026-11-02", 0), "Pendente");
  assert.equal(folderStatusLabel("vencido", "2026-10-18", 1), "Vencido em 18/10/2026");
  assert.equal(folderStatusLabel("cuidado", "2026-11-02", 1), "Vence em 02/11/2026");
  assert.equal(folderStatusLabel("ok", null, 1), "1 arquivo");
  assert.equal(folderStatusLabel("ok", null, 3), "3 arquivos");
});
