import assert from "node:assert/strict";
import test from "node:test";
import { canSee, relativeLabel, toAppNotification, type NotificationRow } from "./core";

function row(over: Partial<NotificationRow> = {}): NotificationRow {
  return {
    id: "n1",
    kind: "CONTEUDO",
    title: "T",
    body: "B",
    href: null,
    audience: [],
    targetUserId: null,
    createdAt: new Date("2026-09-18T12:00:00Z"),
    ...over,
  };
}

const me = { id: "u1", role: "COLABORADOR" as const, slugs: ["vendas"] };

test("canSee: audiência geral vale para todos", () => {
  assert.equal(canSee(row({ audience: ["*"] }), me), true);
});

test("canSee: audiência por slug do meu subsetor", () => {
  assert.equal(canSee(row({ audience: ["vendas"] }), me), true);
  assert.equal(canSee(row({ audience: ["ti"] }), me), false);
});

test("canSee: alvo individual só para o próprio usuário", () => {
  assert.equal(canSee(row({ targetUserId: "u1" }), me), true);
  assert.equal(canSee(row({ targetUserId: "u2" }), me), false);
});

test("canSee: ADMIN vê qualquer audiência de setor, mas não o individual alheio", () => {
  const admin = { id: "a", role: "ADMIN" as const, slugs: [] };
  assert.equal(canSee(row({ audience: ["ti"] }), admin), true);
  assert.equal(canSee(row({ targetUserId: "u2" }), admin), false);
  assert.equal(canSee(row({ targetUserId: "a" }), admin), true);
});

test("toAppNotification: leva read e createdAt em ISO", () => {
  const n = toAppNotification(row(), true);
  assert.equal(n.read, true);
  assert.equal(n.createdAt, "2026-09-18T12:00:00.000Z");
  assert.equal(n.href, undefined);
});

test("relativeLabel: agora, minutos, horas, ontem e data", () => {
  const now = new Date("2026-09-18T12:00:00Z");
  assert.equal(relativeLabel("2026-09-18T11:59:40Z", now), "agora");
  assert.equal(relativeLabel("2026-09-18T11:45:00Z", now), "há 15 min");
  assert.equal(relativeLabel("2026-09-18T09:00:00Z", now), "há 3 h");
  assert.equal(relativeLabel("2026-09-17T09:00:00Z", now), "ontem");
  assert.equal(relativeLabel("2026-09-10T09:00:00Z", now), "10/09");
});
