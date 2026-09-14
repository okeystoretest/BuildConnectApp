import assert from "node:assert/strict";
import test from "node:test";
import {
  collabScopesForSlug,
  defaultCollabScopes,
  matchesBrand,
  matchesCollabScope,
  matchesOwner,
  type CollabScopedPost,
} from "./cronograma-filters";

/**
 * Contrato do filtro de marca. O caso que mais importa é o do card SEM marca:
 * ele permanece visível sob qualquer seleção, e é justamente o que alguém
 * "simplificando" o filtro para um `includes` apagaria sem notar.
 */

test("seleção vazia não filtra nada", () => {
  assert.equal(matchesBrand("OKEY", []), true);
  assert.equal(matchesBrand("LOV_CLUB", []), true);
  assert.equal(matchesBrand(null, []), true);
});

test("marca selecionada mostra apenas ela", () => {
  assert.equal(matchesBrand("OKEY", ["OKEY"]), true);
  assert.equal(matchesBrand("LOV_CLUB", ["OKEY"]), false);
});

test("card sem marca permanece visível sob qualquer seleção", () => {
  assert.equal(matchesBrand(null, ["OKEY"]), true);
  assert.equal(matchesBrand(undefined, ["LOV_CLUB"]), true);
  assert.equal(matchesBrand("", ["OKEY", "LOV_CLUB"]), true);
});

test("valor irreconhecível conta como sem marca e permanece visível", () => {
  assert.equal(matchesBrand("MARCA_QUE_NAO_EXISTE", ["OKEY"]), true);
  assert.equal(matchesBrand(42, ["OKEY"]), true);
});

test("seleção múltipla aceita qualquer uma das marcas marcadas", () => {
  assert.equal(matchesBrand("OKEY", ["OKEY", "LOV_CLUB"]), true);
  assert.equal(matchesBrand("LOV_CLUB", ["OKEY", "LOV_CLUB"]), true);
});

test("a normalização de resolveBrand vale para o filtro", () => {
  assert.equal(matchesBrand("lov club", ["LOV_CLUB"]), true);
  assert.equal(matchesBrand("okey", ["LOV_CLUB"]), false);
});

/**
 * Recorte por responsável (Gestor/Admin). Seleção vazia é "Geral": mostra
 * tudo, inclusive card sem responsável — que, fora de "Geral", nunca casa
 * com ninguém.
 */
test("seleção de usuários vazia (Geral) mostra qualquer card", () => {
  assert.equal(matchesOwner("u1", []), true);
  assert.equal(matchesOwner(null, []), true);
  assert.equal(matchesOwner(undefined, []), true);
});

test("usuários selecionados mostram só os cards deles", () => {
  assert.equal(matchesOwner("u1", ["u1"]), true);
  assert.equal(matchesOwner("u2", ["u1"]), false);
  assert.equal(matchesOwner("u2", ["u1", "u2"]), true);
});

test("card sem responsável só aparece em Geral", () => {
  assert.equal(matchesOwner(null, ["u1"]), false);
  assert.equal(matchesOwner(undefined, ["u1"]), false);
});

/**
 * Recorte do Colaborador: os próprios cards sempre; cada chip SOMA um grupo
 * de colegas. "Setor" é o que a aba atual liberou (Setor ou Público criados
 * nela); "Marketing" é o que o Marketing publicou.
 */
const EU = "eu";
const COLEGA = "colega";

function card(
  ownerId: string | null,
  visibility: "SHARED" | "SECTOR" | "PRIVATE",
  originSlug: string | null,
): CollabScopedPost {
  return { ownerId, visibility, originSlug };
}

test("o próprio card aparece com qualquer combinação de chips", () => {
  for (const scopes of [[], ["SECTOR"], ["MARKETING"], ["SECTOR", "MARKETING"]] as const) {
    assert.equal(matchesCollabScope(card(EU, "PRIVATE", "vendas"), EU, "vendas", scopes), true);
  }
});

test("nenhum chip ligado = só os próprios", () => {
  assert.equal(matchesCollabScope(card(COLEGA, "SHARED", "marketing"), EU, "vendas", []), false);
  assert.equal(matchesCollabScope(card(COLEGA, "SECTOR", "vendas"), EU, "vendas", []), false);
});

test("chip Setor traz Setor e Público criados na aba atual", () => {
  const scopes = ["SECTOR"] as const;
  assert.equal(matchesCollabScope(card(COLEGA, "SECTOR", "vendas"), EU, "vendas", scopes), true);
  assert.equal(matchesCollabScope(card(COLEGA, "SHARED", "vendas"), EU, "vendas", scopes), true);
  // Público do Marketing NÃO entra pelo chip Setor de Vendas.
  assert.equal(matchesCollabScope(card(COLEGA, "SHARED", "marketing"), EU, "vendas", scopes), false);
  // Somente eu de colega nunca aparece, mesmo que chegasse.
  assert.equal(matchesCollabScope(card(COLEGA, "PRIVATE", "vendas"), EU, "vendas", scopes), false);
});

test("chip Marketing traz só o Público criado no Marketing", () => {
  const scopes = ["MARKETING"] as const;
  assert.equal(matchesCollabScope(card(COLEGA, "SHARED", "marketing"), EU, "vendas", scopes), true);
  assert.equal(matchesCollabScope(card(COLEGA, "SECTOR", "marketing"), EU, "vendas", scopes), false);
  assert.equal(matchesCollabScope(card(COLEGA, "SHARED", "vendas"), EU, "vendas", scopes), false);
});

test("os dois chips somam os dois grupos", () => {
  const scopes = ["SECTOR", "MARKETING"] as const;
  assert.equal(matchesCollabScope(card(COLEGA, "SECTOR", "vendas"), EU, "vendas", scopes), true);
  assert.equal(matchesCollabScope(card(COLEGA, "SHARED", "marketing"), EU, "vendas", scopes), true);
  assert.equal(matchesCollabScope(card(COLEGA, "SHARED", "criacao"), EU, "vendas", scopes), false);
});

test("card sem responsável conta como de colega", () => {
  assert.equal(matchesCollabScope(card(null, "SHARED", "marketing"), EU, "vendas", []), false);
  assert.equal(
    matchesCollabScope(card(null, "SHARED", "marketing"), EU, "vendas", ["MARKETING"]),
    true,
  );
});

test("na aba Marketing, o chip Setor já cobre o que o chip Marketing traria", () => {
  assert.deepEqual(collabScopesForSlug("marketing"), ["SECTOR"]);
  assert.deepEqual(collabScopesForSlug("vendas"), ["SECTOR", "MARKETING"]);
});

test("padrão do colaborador é 'próprios + Marketing'; na aba Marketing, o chip Setor faz esse papel", () => {
  assert.deepEqual(defaultCollabScopes("vendas"), ["MARKETING"]);
  assert.deepEqual(defaultCollabScopes("criacao"), ["MARKETING"]);
  assert.deepEqual(defaultCollabScopes("marketing"), ["SECTOR"]);
});
