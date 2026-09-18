import assert from "node:assert/strict";
import test from "node:test";
import { mergeSharedVideos } from "./video-share";

/**
 * Um vídeo compartilhado é a MESMA linha de Video, lida por outro subsetor.
 * Se o dono também for destino (share para si mesmo, por engano ou por dado
 * antigo), o card não pode aparecer duas vezes.
 */

test("próprios vêm antes dos compartilhados", () => {
  const merged = mergeSharedVideos([{ id: "a" }], [{ id: "b" }]);
  assert.deepEqual(merged.map((v) => v.id), ["a", "b"]);
});

test("não repete um id que já está entre os próprios", () => {
  const merged = mergeSharedVideos([{ id: "a" }, { id: "b" }], [{ id: "b" }, { id: "c" }]);
  assert.deepEqual(merged.map((v) => v.id), ["a", "b", "c"]);
});

test("listas vazias devolvem vazio", () => {
  assert.deepEqual(mergeSharedVideos([], []), []);
});
