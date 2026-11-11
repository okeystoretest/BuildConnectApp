import assert from "node:assert/strict";
import test from "node:test";
import { FORMAT, FORMAT_LABEL, FORMAT_ORDER, formatLabel } from "./funnel";

/**
 * Contrato do vocabulário de formatos.
 *
 * O que estes testes guardam é a SINCRONIA entre o enum e a ordem canônica.
 * `FORMAT` e `FORMAT_LABEL` são `Record<ContentFormat, …>` e o compilador
 * cobra as chaves que faltam — mas `FORMAT_ORDER` é um array, e um formato
 * novo esquecido nele simplesmente DESAPARECE do formulário e das tags, sem
 * erro de tipo e sem erro em tela. Foi o que quase aconteceu ao incluir
 * "Lançamento".
 */

test("FORMAT_ORDER cobre todos os formatos do enum", () => {
  assert.deepEqual([...FORMAT_ORDER].sort(), Object.keys(FORMAT).sort());
});

test("FORMAT_ORDER não repete formato", () => {
  assert.equal(new Set(FORMAT_ORDER).size, FORMAT_ORDER.length);
});

test("Lançamento está no vocabulário, e OUTRO continua sendo o último", () => {
  assert.ok(FORMAT_ORDER.includes("LANCAMENTO"));
  assert.equal(FORMAT_ORDER.at(-1), "OUTRO");
});

test("todo formato tem rótulo e cor próprios", () => {
  const colors = new Set<string>();
  for (const format of FORMAT_ORDER) {
    assert.ok(FORMAT_LABEL[format]?.length, `${format} sem rótulo`);
    assert.match(FORMAT[format].color, /^#[0-9a-f]{6}$/, `${format} sem cor hex`);
    colors.add(FORMAT[format].color);
  }
  // Cor repetida tornaria dois formatos indistinguíveis na tag do calendário.
  assert.equal(colors.size, FORMAT_ORDER.length);
});

test("formatLabel só troca o rótulo em OUTRO", () => {
  assert.equal(formatLabel("LANCAMENTO", "ignorado"), "Lançamento");
  assert.equal(formatLabel("OUTRO", "Newsletter"), "Newsletter");
  // "Outro" sem texto cai no rótulo genérico em vez de sair vazio.
  assert.equal(formatLabel("OUTRO", "  "), "Outro");
});
