import assert from "node:assert/strict";
import test from "node:test";
import { stripCategoryPrefix } from "./ticket-title";

/**
 * O título do chamado é gravado como "Categoria — início da descrição". No
 * quadro da Retaguarda a categoria já está na tag, então o prefixo sai —
 * mas só quando é exatamente a categoria do chamado, para não comer um
 * travessão que faça parte do texto.
 */
test("tira o prefixo da categoria do próprio chamado", () => {
  assert.equal(
    stripCategoryPrefix("Sites e Sistemas Internos — Na vesti não aparece", "Sites e Sistemas Internos"),
    "Na vesti não aparece",
  );
});

test("título sem o prefixo fica como está", () => {
  assert.equal(stripCategoryPrefix("Impressora parou", "Equipamentos"), "Impressora parou");
  assert.equal(stripCategoryPrefix("Rede — lenta", "Equipamentos"), "Rede — lenta");
});

test("não devolve título vazio: se só havia o prefixo, mantém o original", () => {
  assert.equal(stripCategoryPrefix("Equipamentos — ", "Equipamentos"), "Equipamentos — ");
});
