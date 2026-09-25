import assert from "node:assert/strict";
import test from "node:test";
import {
  ACTIVITY_PAGE_SIZE,
  activityId,
  compareActivity,
  isAfterCursor,
  mergeActivity,
  type ActivityItem,
} from "./activity-timeline";

const at = (iso: string) => new Date(iso);

function item(kind: ActivityItem["kind"], sourceId: string, iso: string): ActivityItem {
  return {
    id: activityId(kind, sourceId),
    kind,
    occurredAt: at(iso),
    title: `${kind} ${sourceId}`,
  };
}

test("o id composto leva o tipo como prefixo", () => {
  assert.equal(activityId("LOGIN", "abc"), "LOGIN:abc");
});

test("a ordem é decrescente por data", () => {
  const velho = item("LOGIN", "a", "2026-01-01T10:00:00.000Z");
  const novo = item("LOGIN", "b", "2026-02-01T10:00:00.000Z");
  assert.ok(compareActivity(novo, velho) < 0);
  assert.ok(compareActivity(velho, novo) > 0);
});

test("data igual desempata pelo id composto, e o tipo vem nele", () => {
  const mesmo = "2026-01-01T10:00:00.000Z";
  const login = item("LOGIN", "z", mesmo);
  const cadastro = item("CADASTRO", "a", mesmo);
  // "CADASTRO:a" < "LOGIN:z"
  assert.ok(compareActivity(cadastro, login) < 0);
});

test("a ordenação é estável sob entrada embaralhada", () => {
  const mesmo = "2026-01-01T10:00:00.000Z";
  const a = item("LOGIN", "a", mesmo);
  const b = item("LOGIN", "b", mesmo);
  const c = item("LOGIN", "c", mesmo);
  assert.deepEqual([c, a, b].sort(compareActivity), [a, b, c]);
  assert.deepEqual([b, c, a].sort(compareActivity), [a, b, c]);
});

test("isAfterCursor: data mais antiga vem depois na ordem decrescente", () => {
  const cursor = { occurredAt: "2026-02-01T10:00:00.000Z", id: "LOGIN:b" };
  assert.equal(isAfterCursor(item("LOGIN", "a", "2026-01-01T10:00:00.000Z"), cursor), true);
  assert.equal(isAfterCursor(item("LOGIN", "c", "2026-03-01T10:00:00.000Z"), cursor), false);
});

test("isAfterCursor: no mesmo instante, decide o id — e o próprio cursor fica fora", () => {
  const mesmo = "2026-02-01T10:00:00.000Z";
  const cursor = { occurredAt: mesmo, id: "LOGIN:b" };
  assert.equal(isAfterCursor(item("LOGIN", "c", mesmo), cursor), true);
  assert.equal(isAfterCursor(item("LOGIN", "a", mesmo), cursor), false);
  // O cursor é o último item JÁ exibido: não pode voltar.
  assert.equal(isAfterCursor(item("LOGIN", "b", mesmo), cursor), false);
});

test("empate de milissegundo na virada de página não perde nem repete evento", () => {
  // Três eventos no MESMO instante, página de 2: o do meio é a virada.
  const mesmo = "2026-02-01T10:00:00.000Z";
  const a = item("LOGIN", "a", mesmo);
  const b = item("LOGIN", "b", mesmo);
  const c = item("LOGIN", "c", mesmo);

  const p1 = mergeActivity([[a, b, c]], null, 2);
  assert.deepEqual(
    p1.events.map((e) => e.id),
    ["LOGIN:a", "LOGIN:b"],
  );
  assert.deepEqual(p1.nextCursor, { occurredAt: mesmo, id: "LOGIN:b" });

  const p2 = mergeActivity([[a, b, c]], p1.nextCursor, 2);
  assert.deepEqual(
    p2.events.map((e) => e.id),
    ["LOGIN:c"],
  );
  assert.equal(p2.nextCursor, null);

  // Nenhum id apareceu duas vezes, e nenhum ficou de fora.
  const vistos = [...p1.events, ...p2.events].map((e) => e.id);
  assert.equal(vistos.length, 3);
  assert.deepEqual([...new Set(vistos)].sort(), ["LOGIN:a", "LOGIN:b", "LOGIN:c"]);
});

test("a fusão junta fontes diferentes numa ordem só", () => {
  const logins = [item("LOGIN", "l1", "2026-03-01T10:00:00.000Z")];
  const videos = [item("VIDEO_ASSISTIDO", "v1", "2026-02-01T10:00:00.000Z")];
  const cadastro = [item("CADASTRO", "u1", "2026-01-01T10:00:00.000Z")];

  const out = mergeActivity([logins, videos, cadastro], null, 10);
  assert.deepEqual(
    out.events.map((e) => e.kind),
    ["LOGIN", "VIDEO_ASSISTIDO", "CADASTRO"],
  );
  assert.equal(out.nextCursor, null);
});

test("mais eventos que a página devolvem cursor; a última página devolve nulo", () => {
  const muitos = Array.from({ length: 5 }, (_, i) =>
    item("LOGIN", `l${i}`, `2026-01-0${i + 1}T10:00:00.000Z`),
  );
  const p1 = mergeActivity([muitos], null, 3);
  assert.equal(p1.events.length, 3);
  assert.ok(p1.nextCursor);

  const p2 = mergeActivity([muitos], p1.nextCursor, 3);
  assert.equal(p2.events.length, 2);
  assert.equal(p2.nextCursor, null);
});

test("página cheia com as fontes esgotadas não promete mais uma página", () => {
  // Exatamente 3 eventos, página de 3: não há quarto, o cursor tem de ser nulo.
  const tres = Array.from({ length: 3 }, (_, i) =>
    item("LOGIN", `l${i}`, `2026-01-0${i + 1}T10:00:00.000Z`),
  );
  const out = mergeActivity([tres], null, 3);
  assert.equal(out.events.length, 3);
  assert.equal(out.nextCursor, null);
});

test("nenhum evento não quebra", () => {
  const out = mergeActivity([[], [], []], null, 10);
  assert.deepEqual(out.events, []);
  assert.equal(out.nextCursor, null);
});

test("a página tem 30 eventos", () => {
  assert.equal(ACTIVITY_PAGE_SIZE, 30);
});
