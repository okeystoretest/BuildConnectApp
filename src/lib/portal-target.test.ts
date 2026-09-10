import assert from "node:assert/strict";
import test from "node:test";
import { resolvePortalTarget, type ContainerNode } from "./portal-target";

/**
 * Contrato entre o modal e a tela cheia nativa.
 *
 * Os dois casos são opostos e precisam continuar convivendo:
 * o calendário em tela cheia PRECISA atrair o modal para dentro de si, e o
 * player de vídeo dentro do modal NÃO pode atrair. Se alguém simplificar isto
 * para "sempre siga o fullscreenElement", o vídeo de boas-vindas volta a
 * piscar sem expandir — em silêncio, porque nada lança erro.
 */

/** Nó falso: `contains` responde a partir de uma lista de descendentes. */
function node(name: string, descendants: string[] = []): ContainerNode & { name: string } {
  return {
    name,
    contains(other: unknown) {
      const target = other as { name?: string } | null;
      if (!target?.name) return false;
      return target.name === name || descendants.includes(target.name);
    },
  };
}

const body = node("body");

test("sem nada em tela cheia, o alvo é o body", () => {
  assert.equal(resolvePortalTarget(null, node("modal"), body), body);
});

test("calendário em tela cheia atrai o modal para dentro de si", () => {
  const calendario = node("calendario");
  // O modal já existe (reabertura) e não contém o calendário.
  assert.equal(resolvePortalTarget(calendario, node("modal"), body), calendario);
});

test("primeira pintura com algo já em tela cheia usa o elemento em tela cheia", () => {
  const calendario = node("calendario");
  assert.equal(resolvePortalTarget(calendario, null, body), calendario);
});

test("tela cheia pedida DENTRO do modal não move o portal", () => {
  const player = node("player");
  const modal = node("modal", ["player"]);
  assert.equal(resolvePortalTarget(player, modal, body), body);
});

test("o próprio modal em tela cheia também não move o portal", () => {
  const modal = node("modal");
  assert.equal(resolvePortalTarget(modal, modal, body), body);
});
