import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveGraders,
  canGrade,
  type ComprehensionAuthor,
  type GraderCandidate,
} from "./video-comprehension-scope";

const ADMIN: GraderCandidate = { id: "adm", role: "ADMIN", sectorId: "rh", dho: true };
const DHO_GESTOR: GraderCandidate = { id: "dho", role: "GESTOR", sectorId: "rh", dho: true };
const VENDAS_G1: GraderCandidate = { id: "v1", role: "GESTOR", sectorId: "vendas", dho: false };
const VENDAS_G2: GraderCandidate = { id: "v2", role: "GESTOR", sectorId: "vendas", dho: false };
const TI_G: GraderCandidate = { id: "t1", role: "GESTOR", sectorId: "ti", dho: false };
const COLAB: GraderCandidate = { id: "c1", role: "COLABORADOR", sectorId: "vendas", dho: false };

const ALL = [ADMIN, DHO_GESTOR, VENDAS_G1, VENDAS_G2, TI_G, COLAB];

/** Autor colaborador de Vendas, o caso comum. */
const colab = (id: string, sectorId: string | null): ComprehensionAuthor => ({
  authorId: id,
  authorSectorId: sectorId,
  authorRole: "COLABORADOR",
});

const gestor = (id: string, sectorId: string | null): ComprehensionAuthor => ({
  authorId: id,
  authorSectorId: sectorId,
  authorRole: "GESTOR",
});

test("resposta de colaborador de Vendas vai para os Gestores de Vendas", () => {
  const ids = resolveGraders(colab("c1", "vendas"), ALL).map((g) => g.id);
  assert.deepEqual(ids, ["v1", "v2"]);
});

test("colaborador nunca avalia, mesmo do mesmo setor", () => {
  const ids = resolveGraders(colab("x", "vendas"), ALL).map((g) => g.id);
  assert.ok(!ids.includes("c1"));
});

test("resposta de GESTOR sobe para os Admins, nunca para um par do setor", () => {
  // Antes caía no outro Gestor de Vendas ("v2"). A nota de quem gere o setor
  // vem de cima, não de lado.
  const ids = resolveGraders(gestor("v1", "vendas"), ALL).map((g) => g.id);
  assert.deepEqual(ids, ["adm"]);
  assert.ok(!ids.includes("v2"), "o par do mesmo setor não avalia o Gestor");
});

test("vai para TODOS os Admins, qualquer que seja o setor deles", () => {
  const ADMIN_PROD: GraderCandidate = {
    id: "adm2",
    role: "ADMIN",
    sectorId: "producao",
    dho: false,
  };
  const ids = resolveGraders(gestor("v1", "vendas"), [...ALL, ADMIN_PROD]).map((g) => g.id);
  assert.deepEqual(ids, ["adm", "adm2"]);
});

test("Gestor do DHO respondendo também sobe para o Admin, nunca para si", () => {
  const ids = resolveGraders(gestor("dho", "rh"), ALL).map((g) => g.id);
  assert.deepEqual(ids, ["adm"]);
});

test("sem Admin cadastrado, a resposta de Gestor cede para a regra de baixo", () => {
  // Senão a resposta de um Gestor ficaria sem ninguém para avaliá-la, e
  // esperaria para sempre numa fila que ninguém vê.
  const semAdmin = ALL.filter((c) => c.role !== "ADMIN");
  const ids = resolveGraders(gestor("v1", "vendas"), semAdmin).map((g) => g.id);
  assert.deepEqual(ids, ["v2"]);
});

test("autor sem setor: Admin e DHO", () => {
  const ids = resolveGraders(colab("c1", null), ALL).map((g) => g.id);
  assert.deepEqual(ids, ["adm", "dho"]);
});

test("setor sem Gestor: Admin e DHO", () => {
  const ids = resolveGraders(colab("c1", "producao"), ALL).map((g) => g.id);
  assert.deepEqual(ids, ["adm", "dho"]);
});

test("canGrade responde pela mesma regra", () => {
  assert.equal(canGrade(VENDAS_G1, colab("c1", "vendas"), ALL), true);
  assert.equal(canGrade(TI_G, colab("c1", "vendas"), ALL), false);
  assert.equal(canGrade(ADMIN, colab("c1", "vendas"), ALL), false);
  // Autor Gestor: o Admin avalia, o colega de setor não.
  assert.equal(canGrade(ADMIN, gestor("t1", "ti"), ALL), true);
  assert.equal(canGrade(VENDAS_G2, gestor("v1", "vendas"), ALL), false);
});
