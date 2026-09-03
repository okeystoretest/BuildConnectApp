import assert from "node:assert/strict";
import test from "node:test";
import { can } from "./permissions";

test("forms.manage pertence a GESTOR e ADMIN, nunca ao COLABORADOR", () => {
  assert.equal(can("ADMIN", "forms.manage"), true);
  assert.equal(can("GESTOR", "forms.manage"), true);
  assert.equal(can("COLABORADOR", "forms.manage"), false);
});

test("forms.manage é distinta de sector.hr — o gestor cria formulário sem administrar o DHO", () => {
  assert.equal(can("GESTOR", "sector.hr"), false);
  assert.equal(can("GESTOR", "forms.manage"), true);
});
