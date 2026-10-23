import assert from "node:assert/strict";
import test from "node:test";
import { pageWindow } from "./paginate";

test("até sete páginas a faixa mostra todas — não há o que recortar", () => {
  assert.deepEqual(pageWindow(1, 1), [1]);
  assert.deepEqual(pageWindow(3, 7), [1, 2, 3, 4, 5, 6, 7]);
});

test("as duas pontas estão sempre na faixa", () => {
  // 1 e a última são os destinos mais pedidos; some o meio, nunca elas.
  for (const current of [1, 2, 9, 20, 36, 37]) {
    const w = pageWindow(current, 37);
    assert.equal(w[0], 1, `página ${current}: falta a primeira`);
    assert.equal(w[w.length - 1], 37, `página ${current}: falta a última`);
  }
});

test("a largura não muda de página para página — o botão não foge do cursor", () => {
  for (let current = 1; current <= 37; current += 1) {
    assert.equal(
      pageWindow(current, 37).length,
      7,
      `página ${current} desenhou um número diferente de casas`,
    );
  }
});

test("a atual aparece, com os vizinhos, e o salto vira lacuna", () => {
  assert.deepEqual(pageWindow(20, 37), [1, "gap", 19, 20, 21, "gap", 37]);
  // Nas pontas a janela é empurrada para dentro em vez de encolher.
  assert.deepEqual(pageWindow(1, 37), [1, 2, 3, 4, 5, "gap", 37]);
  assert.deepEqual(pageWindow(37, 37), [1, "gap", 33, 34, 35, 36, 37]);
});

test("sem lacuna onde a sequência é contínua", () => {
  // 8 páginas na primeira: 1..5 seguidos, lacuna só antes da última.
  assert.deepEqual(pageWindow(2, 8), [1, 2, 3, 4, 5, "gap", 8]);
  assert.deepEqual(pageWindow(7, 8), [1, "gap", 4, 5, 6, 7, 8]);
});

test("a faixa é sempre crescente e sem número repetido", () => {
  for (const pages of [8, 12, 37, 200]) {
    for (let current = 1; current <= pages; current += 1) {
      const nums = pageWindow(current, pages).filter((n): n is number => n !== "gap");
      const ordenada = [...nums].sort((a, b) => a - b);
      assert.deepEqual(nums, ordenada, `pages=${pages} page=${current}: fora de ordem`);
      assert.equal(new Set(nums).size, nums.length, `pages=${pages} page=${current}: repetido`);
    }
  }
});
