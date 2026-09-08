import assert from "node:assert/strict";
import test from "node:test";
import { canReachSector } from "./scope";

test("DHO/Admin alcança colaborador de qualquer setor", () => {
  assert.equal(
    canReachSector({ role: "ADMIN", actorSector: "Comercial", subjectSector: "Financeiro" }),
    true,
  );
});

test("Admin alcança mesmo sem setor próprio cadastrado", () => {
  // sector.hr decide antes de olhar setor algum: um admin sem lotação
  // continua sendo o DHO.
  assert.equal(
    canReachSector({ role: "ADMIN", actorSector: null, subjectSector: "Financeiro" }),
    true,
  );
});

test("Gestor alcança o próprio setor", () => {
  assert.equal(
    canReachSector({ role: "GESTOR", actorSector: "Financeiro", subjectSector: "Financeiro" }),
    true,
  );
});

test("Gestor NÃO alcança outro setor", () => {
  // O achado da auditoria. O gestor do Comercial designado avaliador numa
  // rodada do Financeiro recebe o roundId legitimamente (getMyEvaluationTasks
  // devolve a todo avaliador) — e sem esta negativa lia o consolidado inteiro:
  // o nome de cada avaliador e a nota que cada um deu.
  assert.equal(
    canReachSector({ role: "GESTOR", actorSector: "Comercial", subjectSector: "Financeiro" }),
    false,
  );
});

test("Gestor sem setor não alcança ninguém", () => {
  assert.equal(
    canReachSector({ role: "GESTOR", actorSector: null, subjectSector: "Financeiro" }),
    false,
  );
});

test("avaliado sem setor não é alcançado pelo Gestor", () => {
  // O DTO do detalhe usa "—" quando o avaliado não tem setor. O placeholder
  // nunca casa com um rótulo real, então nega — e é o que se quer.
  assert.equal(
    canReachSector({ role: "GESTOR", actorSector: "Financeiro", subjectSector: null }),
    false,
  );
  assert.equal(
    canReachSector({ role: "GESTOR", actorSector: "Financeiro", subjectSector: "—" }),
    false,
  );
});

test("setor é comparado por rótulo exato, sem normalizar", () => {
  // Se um dia os rótulos divergirem em caixa ou acento, a regra NEGA em vez de
  // adivinhar. Falhar fechado é o comportamento certo aqui.
  assert.equal(
    canReachSector({ role: "GESTOR", actorSector: "financeiro", subjectSector: "Financeiro" }),
    false,
  );
});
