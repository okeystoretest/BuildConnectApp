import assert from "node:assert/strict";
import test from "node:test";
import { sortInstrucoes } from "./instrucoes-video";

/**
 * Instruções em Vídeo listam em ordem alfabética por padrão (pedido de
 * 18/09/2026). A ordem de envio (`order`) deixa de mandar nesta aba.
 */

test("ordena por título, ignorando caixa e acento", () => {
  const sorted = sortInstrucoes([
    { title: "Órgãos de segurança" },
    { title: "abertura de caixa" },
    { title: "Empilhadeira" },
  ]);
  assert.deepEqual(
    sorted.map((v) => v.title),
    ["abertura de caixa", "Empilhadeira", "Órgãos de segurança"],
  );
});

test("números no título ordenam como números, não como texto", () => {
  const sorted = sortInstrucoes([{ title: "Módulo 10" }, { title: "Módulo 2" }, { title: "Módulo 1" }]);
  assert.deepEqual(sorted.map((v) => v.title), ["Módulo 1", "Módulo 2", "Módulo 10"]);
});

test("não muda a lista original", () => {
  const original = [{ title: "B" }, { title: "A" }];
  sortInstrucoes(original);
  assert.deepEqual(original.map((v) => v.title), ["B", "A"]);
});
