import assert from "node:assert/strict";
import test from "node:test";
import { REDO_GROUP, flattenPending } from "./pending-content";
import type { PendingCategory, PendingItem } from "./pending-content";

/**
 * A ordem da lista única de "Meu Progresso". Ela existe para a paginação de 10
 * em 10 ser honesta — e a regra que não pode se perder é que um vídeo a
 * refazer nunca cai para a segunda página por acaso.
 */

function item(id: string, rejections = 0): PendingItem {
  return {
    id,
    kind: "VIDEO",
    title: id,
    sector: "Sub",
    meta: "Vídeo",
    subsectorSlug: "sub",
    rejections,
  };
}

function group(category: string, items: PendingItem[]): PendingCategory {
  return { category, items };
}

test("lista vazia vira lista vazia", () => {
  assert.deepEqual(flattenPending([]), []);
});

test("sem reprovações, mantém a ordem dos grupos e dos itens", () => {
  const rows = flattenPending([
    group("Retaguarda", [item("a"), item("b")]),
    group("Logística", [item("c")]),
  ]);
  assert.deepEqual(
    rows.map((r) => [r.item.id, r.group]),
    [
      ["a", "Retaguarda"],
      ["b", "Retaguarda"],
      ["c", "Logística"],
    ],
  );
});

test("reprovados vão para o topo, sob o rótulo Refazer", () => {
  const rows = flattenPending([
    group("Retaguarda", [item("a"), item("b", 1)]),
    group("Logística", [item("c", 2), item("d")]),
  ]);
  assert.deepEqual(
    rows.map((r) => [r.item.id, r.group]),
    [
      ["b", REDO_GROUP],
      ["c", REDO_GROUP],
      ["a", "Retaguarda"],
      ["d", "Logística"],
    ],
  );
});

test("reprovados de setores diferentes ficam juntos, na ordem em que vieram", () => {
  const rows = flattenPending([
    group("Retaguarda", [item("a", 1)]),
    group("Logística", [item("b", 3)]),
    group("Comercial", [item("c", 1)]),
  ]);
  assert.deepEqual(
    rows.map((r) => r.item.id),
    ["a", "b", "c"],
  );
  assert.ok(rows.every((r) => r.group === REDO_GROUP));
});

test("onze reprovados enchem a primeira página inteira — nenhum item comum se intromete", () => {
  const redo = Array.from({ length: 11 }, (_, i) => item(`r${i}`, 1));
  const rows = flattenPending([group("Retaguarda", [item("comum"), ...redo])]);
  assert.deepEqual(
    rows.slice(0, 11).map((r) => r.item.id),
    redo.map((r) => r.id),
  );
  assert.equal(rows[11]?.item.id, "comum");
});
