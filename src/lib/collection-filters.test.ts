import assert from "node:assert/strict";
import test from "node:test";
import {
  EMPTY_COLLECTION_FILTER,
  deriveCollectionOptions,
  hasCollectionFilter,
  matchesCollection,
} from "./collection-filters";

const ITENS = [
  { temporada: "Verão", colecao: "Cápsula 1", ano: 2026 },
  { temporada: "verão", colecao: "Cápsula 2", ano: 2025 },
  { temporada: "Inverno", colecao: "Cápsula 1", ano: 2026 },
  // Enviado antes do recurso: sem temporada nem coleção.
  { ano: 2024 },
];

// ── Opções dos seletores ─────────────────────────────────────────────────

test("as opções são o que está em uso, sem repetir por diferença de caixa", () => {
  const o = deriveCollectionOptions(ITENS);
  assert.deepEqual(o.temporada, ["Inverno", "Verão"]);
  assert.deepEqual(o.colecao, ["Cápsula 1", "Cápsula 2"]);
});

test("os anos vêm do mais recente para o mais antigo", () => {
  assert.deepEqual(deriveCollectionOptions(ITENS).ano, ["2026", "2025", "2024"]);
});

test("campo vazio não entra como opção", () => {
  const o = deriveCollectionOptions([{ temporada: "  ", colecao: "", ano: 2026 }]);
  assert.deepEqual(o.temporada, []);
  assert.deepEqual(o.colecao, []);
});

// ── Correspondência ──────────────────────────────────────────────────────

test("sem filtro escolhido, tudo passa", () => {
  assert.equal(hasCollectionFilter(EMPTY_COLLECTION_FILTER), false);
  for (const item of ITENS) assert.ok(matchesCollection(item, EMPTY_COLLECTION_FILTER));
});

test("os três campos combinam por interseção, não por união", () => {
  const filtro = { temporada: "Verão", colecao: "Cápsula 1", ano: "2026" };
  assert.ok(matchesCollection(ITENS[0]!, filtro));
  // Mesma temporada, outra coleção: não passa.
  assert.equal(matchesCollection(ITENS[1]!, filtro), false);
  // Mesma coleção e ano, outra temporada: não passa.
  assert.equal(matchesCollection(ITENS[2]!, filtro), false);
});

test("a caixa da temporada escolhida não importa", () => {
  assert.ok(matchesCollection(ITENS[1]!, { ...EMPTY_COLLECTION_FILTER, temporada: "VERÃO" }));
});

test("item sem temporada não passa quando uma temporada é exigida", () => {
  assert.equal(
    matchesCollection(ITENS[3]!, { ...EMPTY_COLLECTION_FILTER, temporada: "Verão" }),
    false,
  );
  // Mas continua achável pelo ano, que todo item tem.
  assert.ok(matchesCollection(ITENS[3]!, { ...EMPTY_COLLECTION_FILTER, ano: "2024" }));
});
