import assert from "node:assert/strict";
import test from "node:test";
import { deriveFilters, matchesFilters } from "./video-filters";

/**
 * As pílulas de filtro nascem das tags atribuídas na edição dos vídeos —
 * não existe mais filtro solto, criado à mão e guardado só na memória da
 * aba. O que aparece na barra é exatamente o conjunto de tags em uso.
 */

test("as pílulas são a união das tags, sem repetição e em ordem alfabética", () => {
  const filters = deriveFilters([
    { tags: ["Segurança", "EPI"] },
    { tags: ["epi", "Máquinas"] },
    { tags: undefined },
    { tags: [] },
  ]);
  assert.deepEqual(filters, ["EPI", "Máquinas", "Segurança"]);
});

test("tags iguais em caixa diferente contam uma vez, mantendo a primeira grafia", () => {
  assert.deepEqual(deriveFilters([{ tags: ["Epi"] }, { tags: ["EPI"] }]), ["Epi"]);
});

test("sem filtro ativo, todo vídeo passa", () => {
  assert.equal(matchesFilters({ tags: [] }, []), true);
  assert.equal(matchesFilters({ tags: undefined }, []), true);
});

test("com filtros ativos, basta o vídeo ter UMA das tags escolhidas", () => {
  const video = { tags: ["Segurança"] };
  assert.equal(matchesFilters(video, ["EPI", "Segurança"]), true);
  assert.equal(matchesFilters(video, ["EPI"]), false);
  assert.equal(matchesFilters({ tags: undefined }, ["EPI"]), false);
});

test("a comparação de tag ignora caixa", () => {
  assert.equal(matchesFilters({ tags: ["epi"] }, ["EPI"]), true);
});
