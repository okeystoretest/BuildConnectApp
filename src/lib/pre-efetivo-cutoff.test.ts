import { test } from "node:test";
import assert from "node:assert/strict";
import { PRE_EFETIVO_CUTOFF, isOnboardingSchedule } from "./pre-efetivo-cutoff";

test("o corte é 01/10/2026 à meia-noite no horário de Brasília", () => {
  assert.equal(PRE_EFETIVO_CUTOFF.toISOString(), "2026-10-01T03:00:00.000Z");
});

test("quem foi cadastrado antes do corte NÃO espera: ciclo 1 abre na hora", () => {
  assert.equal(isOnboardingSchedule(new Date("2026-09-30T23:59:59-03:00")), false);
  assert.equal(isOnboardingSchedule(new Date("2025-01-15T12:00:00Z")), false);
});

test("quem foi cadastrado a partir do corte segue a espera de onboarding (7 dias úteis)", () => {
  assert.equal(isOnboardingSchedule(new Date("2026-10-01T00:00:00-03:00")), true);
  assert.equal(isOnboardingSchedule(new Date("2026-10-01T08:30:00-03:00")), true);
  assert.equal(isOnboardingSchedule(new Date("2027-03-01T00:00:00Z")), true);
});
