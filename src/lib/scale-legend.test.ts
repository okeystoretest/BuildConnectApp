import assert from "node:assert/strict";
import test from "node:test";
import { scaleLegendFor } from "./scale-legend";
import { EVALUATION_CATALOG } from "./evaluation-catalog";

/** Como o instrumento chega à tela: o catálogo já virou linha no banco. */
function formOf(slug: string) {
  const seed = EVALUATION_CATALOG.find((t) => t.slug === slug);
  assert.ok(seed, `instrumento ${slug} não está no catálogo`);
  return { slug: seed.slug, scaleMax: seed.scaleMax, scaleLabels: seed.scaleLabels ?? [] };
}

test("a escala de conformidade do Pré-Efetivo ganha uma palavra por nota", () => {
  assert.deepEqual(scaleLegendFor(formOf("acompanhamento-pre-efetivo")), [
    "Insatisfatório",
    "Regular",
    "Bom",
    "Muito bom",
    "Excelente",
  ]);
});

test("onde a pergunta é de frequência, a legenda fala de frequência", () => {
  const frequencia = ["Nunca", "Raramente", "Às vezes", "Quase sempre", "Sempre"];
  assert.deepEqual(scaleLegendFor(formOf("eficacia-no-trabalho")), frequencia);
  assert.deepEqual(scaleLegendFor(formOf("inteligencia-emocional")), frequencia);
});

test("instrumento que já traz os próprios rótulos não recebe segunda legenda", () => {
  // O Comportamental rotula a escala nos próprios botões. Uma legenda vinda
  // daqui seria uma segunda definição da mesma coisa.
  assert.equal(scaleLegendFor(formOf("desempenho-comportamental")), null);
});

test("escala sem legenda definida não inventa uma", () => {
  assert.equal(scaleLegendFor(formOf("matriz-de-decisao")), null);
  assert.equal(scaleLegendFor({ slug: "instrumento-novo", scaleMax: 5, scaleLabels: [] }), null);
});

test("a legenda tem exatamente uma entrada por nota da escala", () => {
  for (const seed of EVALUATION_CATALOG) {
    const legend = scaleLegendFor(formOf(seed.slug));
    if (legend) assert.equal(legend.length, seed.scaleMax, `legenda de ${seed.slug}`);
  }
});
