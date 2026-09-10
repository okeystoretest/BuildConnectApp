import assert from "node:assert/strict";
import test from "node:test";
import {
  canViewInTab,
  defaultVisibilityForSlug,
  visibilityWhere,
  type PostScope,
  type Viewer,
} from "./cronograma-visibility";
import type { ContentVisibility } from "@/types/cronograma";

/**
 * Contrato de alcance do Cronograma.
 *
 * O último teste é o que mais importa: ele prova que `canViewInTab` e a
 * cláusula de `visibilityWhere` concordam. São os dois lados da mesma regra —
 * um decide o que a tela mostra, o outro decide o que o banco entrega — e a
 * divergência entre eles não levanta erro nenhum.
 */

const AUTOR = "user-autor";
const COLEGA = "user-colega";

const colaborador = (id: string): Viewer => ({ id, role: "COLABORADOR" });
const admin = (id: string): Viewer => ({ id, role: "ADMIN" });

function post(visibility: ContentVisibility, originSlug: string | null): PostScope {
  return { visibility, originSlug, createdById: AUTOR };
}

test("público aparece nas três abas", () => {
  const p = post("SHARED", "marketing");
  for (const slug of ["marketing", "vendas", "criacao"]) {
    assert.equal(canViewInTab(p, colaborador(COLEGA), slug), true, slug);
  }
});

test("setor aparece para o colega da MESMA aba", () => {
  assert.equal(canViewInTab(post("SECTOR", "marketing"), colaborador(COLEGA), "marketing"), true);
});

test("setor NÃO vaza para as outras abas, mesmo compartilhando a base", () => {
  const p = post("SECTOR", "marketing");
  assert.equal(canViewInTab(p, colaborador(COLEGA), "vendas"), false);
  assert.equal(canViewInTab(p, colaborador(COLEGA), "criacao"), false);
});

test("somente eu não aparece nem para o colega da mesma aba", () => {
  assert.equal(canViewInTab(post("PRIVATE", "vendas"), colaborador(COLEGA), "vendas"), false);
});

test("o autor enxerga o próprio card em qualquer alcance", () => {
  for (const v of ["SHARED", "SECTOR", "PRIVATE"] as const) {
    assert.equal(canViewInTab(post(v, "vendas"), colaborador(AUTOR), "vendas"), true, v);
  }
});

test("admin enxerga tudo", () => {
  assert.equal(canViewInTab(post("PRIVATE", "vendas"), admin("adm"), "marketing"), true);
});

test("card antigo sem originSlug não vaza como se fosse do setor", () => {
  assert.equal(canViewInTab(post("SECTOR", null), colaborador(COLEGA), "vendas"), false);
});

test("padrão do formulário reproduz o comportamento anterior aos botões", () => {
  assert.equal(defaultVisibilityForSlug("marketing"), "SHARED");
  assert.equal(defaultVisibilityForSlug("criacao"), "SHARED");
  assert.equal(defaultVisibilityForSlug("vendas"), "PRIVATE");
  assert.equal(defaultVisibilityForSlug("rh"), "PRIVATE");
});

/**
 * Interpreta a cláusula que vai ao Prisma: um `OR` de condições, cada uma
 * exigindo igualdade em todos os campos que declara. É o suficiente para a
 * forma que `visibilityWhere` produz.
 */
function matchesWhere(where: Record<string, unknown>, row: PostScope): boolean {
  const clauses = where.OR as Array<Record<string, unknown>> | undefined;
  if (!clauses) return true; // `{}` — admin lê tudo
  return clauses.some((clause) =>
    Object.entries(clause).every(
      ([field, value]) => (row as unknown as Record<string, unknown>)[field] === value,
    ),
  );
}

test("a cláusula do banco decide exatamente o mesmo que a regra da tela", () => {
  const alcances = ["SHARED", "SECTOR", "PRIVATE"] as const;
  const origens = ["marketing", "vendas", "criacao", null];
  const abas = ["marketing", "vendas", "criacao"];
  const espectadores = [colaborador(AUTOR), colaborador(COLEGA), admin("adm")];

  let combinacoes = 0;
  for (const visibility of alcances) {
    for (const originSlug of origens) {
      for (const slug of abas) {
        for (const viewer of espectadores) {
          const row: PostScope = { visibility, originSlug, createdById: AUTOR };
          assert.equal(
            matchesWhere(visibilityWhere(slug, viewer), row),
            canViewInTab(row, viewer, slug),
            `${visibility} origem=${originSlug} aba=${slug} quem=${viewer.id}/${viewer.role}`,
          );
          combinacoes += 1;
        }
      }
    }
  }
  assert.equal(combinacoes, 108);
});
