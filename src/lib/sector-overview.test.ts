import assert from "node:assert/strict";
import test from "node:test";
import { approvedAverage, progressPct, splitGrades } from "./sector-overview";

test("a média só considera notas aprovadas", () => {
  assert.equal(approvedAverage([7, 10]), 8.5);
  assert.equal(approvedAverage([7]), 7);
  assert.equal(approvedAverage([8, 9, 9]), 8.7);
});

test("sem nota aprovada não há média — e isso não é zero", () => {
  assert.equal(approvedAverage([]), null);
});

test("splitGrades separa aprovadas de reprovadas", () => {
  const rows = [{ grade: 5 }, { grade: 7 }, { grade: 3 }, { grade: 10 }];
  const out = splitGrades(rows);
  assert.deepEqual(out.approved, [7, 10]);
  assert.equal(out.rejections, 2);
});

test("a nota 6 reprova e a 7 aprova — a borda da regra", () => {
  const out = splitGrades([{ grade: 6 }, { grade: 7 }]);
  assert.deepEqual(out.approved, [7]);
  assert.equal(out.rejections, 1);
});

test("consequência aceita da regra: a média nunca fica abaixo de 7", () => {
  const out = splitGrades([{ grade: 1 }, { grade: 2 }, { grade: 7 }]);
  const average = approvedAverage(out.approved);
  assert.equal(average, 7);
  assert.ok(average !== null && average >= 7);
});

test("percentual arredonda e trata total zero", () => {
  assert.equal(progressPct(3, 4), 75);
  assert.equal(progressPct(0, 0), 0);
  assert.equal(progressPct(1, 3), 33);
  assert.equal(progressPct(2, 3), 67);
});
