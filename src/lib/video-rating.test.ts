import assert from "node:assert/strict";
import test from "node:test";
import { RATING_MIN, RATING_MAX, RATING_CRITERIA, averageOf, isEmptyRating } from "./video-rating";

test("a escala vai de 1 a 5 e há três critérios", () => {
  assert.equal(RATING_MIN, 1);
  assert.equal(RATING_MAX, 5);
  assert.deepEqual(
    RATING_CRITERIA.map((c) => c.key),
    ["audio", "image", "clarity"],
  );
});

test("avaliação vazia é a que não grava nada", () => {
  assert.equal(isEmptyRating({ audio: null, image: null, clarity: null }), true);
  assert.equal(isEmptyRating({ audio: null, image: null, clarity: null, comment: "" }), true);
  // Só espaços continua sendo vazio: senão o banco guarda uma linha em branco.
  assert.equal(isEmptyRating({ audio: null, image: null, clarity: null, comment: "   " }), true);
});

test("um único critério já torna a avaliação real", () => {
  assert.equal(isEmptyRating({ audio: 3, image: null, clarity: null }), false);
  assert.equal(isEmptyRating({ audio: null, image: null, clarity: 1 }), false);
});

test("só comentário também é avaliação", () => {
  assert.equal(
    isEmptyRating({ audio: null, image: null, clarity: null, comment: "som baixo" }),
    false,
  );
});

test("a média ignora os nulos e não os conta no denominador", () => {
  assert.equal(averageOf([5, 4]), 4.5);
  assert.equal(averageOf([5, null, 4]), 4.5);
  assert.equal(averageOf([4, 4, 5]), 4.3);
});

test("sem nenhum valor não há média — e isso não é zero", () => {
  assert.equal(averageOf([]), null);
  assert.equal(averageOf([null, null]), null);
});
