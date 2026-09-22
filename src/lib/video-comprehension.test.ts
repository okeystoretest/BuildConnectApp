import assert from "node:assert/strict";
import test from "node:test";
import {
  COMPREHENSION_GRADE_MIN,
  COMPREHENSION_PASS_MIN,
  isPassing,
  rejectionLevel,
} from "./video-comprehension";

test("a escala começa em 1 e aprova a partir de 7", () => {
  assert.equal(COMPREHENSION_GRADE_MIN, 1);
  assert.equal(COMPREHENSION_PASS_MIN, 7);
});

test("isPassing separa reprovado de aprovado na borda do 7", () => {
  assert.equal(isPassing(6), false);
  assert.equal(isPassing(7), true);
  assert.equal(isPassing(10), true);
  assert.equal(isPassing(1), false);
});

test("rejectionLevel satura em 2: a terceira reprovação não cria estado novo", () => {
  assert.equal(rejectionLevel(0), 0);
  assert.equal(rejectionLevel(1), 1);
  assert.equal(rejectionLevel(2), 2);
  assert.equal(rejectionLevel(5), 2);
});
