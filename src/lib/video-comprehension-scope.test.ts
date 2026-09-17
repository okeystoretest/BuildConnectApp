import assert from "node:assert/strict";
import test from "node:test";
import { resolveGraders, canGrade, type GraderCandidate } from "./video-comprehension-scope";

const ADMIN: GraderCandidate = { id: "adm", role: "ADMIN", sectorId: "rh", dho: true };
const DHO_GESTOR: GraderCandidate = { id: "dho", role: "GESTOR", sectorId: "rh", dho: true };
const VENDAS_G1: GraderCandidate = { id: "v1", role: "GESTOR", sectorId: "vendas", dho: false };
const VENDAS_G2: GraderCandidate = { id: "v2", role: "GESTOR", sectorId: "vendas", dho: false };
const TI_G: GraderCandidate = { id: "t1", role: "GESTOR", sectorId: "ti", dho: false };
const COLAB: GraderCandidate = { id: "c1", role: "COLABORADOR", sectorId: "vendas", dho: false };

const ALL = [ADMIN, DHO_GESTOR, VENDAS_G1, VENDAS_G2, TI_G, COLAB];

test("resposta de colaborador de Vendas vai para os Gestores de Vendas", () => {
  const ids = resolveGraders({ authorId: "c1", authorSectorId: "vendas" }, ALL).map((g) => g.id);
  assert.deepEqual(ids, ["v1", "v2"]);
});

test("colaborador nunca avalia, mesmo do mesmo setor", () => {
  const ids = resolveGraders({ authorId: "x", authorSectorId: "vendas" }, ALL).map((g) => g.id);
  assert.ok(!ids.includes("c1"));
});

test("o autor não avalia a própria resposta: Gestor de Vendas cai para os outros Gestores do setor", () => {
  const ids = resolveGraders({ authorId: "v1", authorSectorId: "vendas" }, ALL).map((g) => g.id);
  assert.deepEqual(ids, ["v2"]);
});

test("único Gestor do setor respondendo: vai para Admin e Gestores do DHO", () => {
  const ids = resolveGraders({ authorId: "t1", authorSectorId: "ti" }, ALL).map((g) => g.id);
  assert.deepEqual(ids, ["adm", "dho"]);
});

test("autor sem setor: Admin e DHO", () => {
  const ids = resolveGraders({ authorId: "c1", authorSectorId: null }, ALL).map((g) => g.id);
  assert.deepEqual(ids, ["adm", "dho"]);
});

test("setor sem Gestor: Admin e DHO", () => {
  const ids = resolveGraders({ authorId: "c1", authorSectorId: "producao" }, ALL).map((g) => g.id);
  assert.deepEqual(ids, ["adm", "dho"]);
});

test("Gestor do DHO respondendo: vai para o Admin e para os outros do DHO, nunca para si", () => {
  const ids = resolveGraders({ authorId: "dho", authorSectorId: "rh" }, ALL).map((g) => g.id);
  assert.deepEqual(ids, ["adm"]);
});

test("canGrade responde pela mesma regra", () => {
  assert.equal(canGrade(VENDAS_G1, { authorId: "c1", authorSectorId: "vendas" }, ALL), true);
  assert.equal(canGrade(TI_G, { authorId: "c1", authorSectorId: "vendas" }, ALL), false);
  assert.equal(canGrade(ADMIN, { authorId: "c1", authorSectorId: "vendas" }, ALL), false);
  assert.equal(canGrade(ADMIN, { authorId: "t1", authorSectorId: "ti" }, ALL), true);
});
