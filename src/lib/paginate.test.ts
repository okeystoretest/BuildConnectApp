import assert from "node:assert/strict";
import test from "node:test";
import { paginate } from "./paginate";

const ITEMS = Array.from({ length: 23 }, (_, i) => i + 1);

test("fatia a página pedida e diz quantas páginas há", () => {
  const page = paginate(ITEMS, 2, 10);
  assert.deepEqual(page.items, [11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
  assert.equal(page.page, 2);
  assert.equal(page.pages, 3);
  assert.equal(page.from, 11);
  assert.equal(page.to, 20);
  assert.equal(page.total, 23);
});

test("a última página vem incompleta, sem inventar itens", () => {
  const page = paginate(ITEMS, 3, 10);
  assert.deepEqual(page.items, [21, 22, 23]);
  assert.equal(page.from, 21);
  assert.equal(page.to, 23);
});

test("página fora do intervalo é puxada para dentro — a busca encolheu a lista", () => {
  assert.equal(paginate(ITEMS, 9, 10).page, 3);
  assert.equal(paginate(ITEMS, 0, 10).page, 1);
  assert.equal(paginate(ITEMS, -2, 10).page, 1);
});

test("lista vazia tem uma página vazia, e não zero páginas", () => {
  const page = paginate([], 1, 10);
  assert.deepEqual(page.items, []);
  assert.equal(page.pages, 1);
  assert.equal(page.from, 0);
  assert.equal(page.to, 0);
});
