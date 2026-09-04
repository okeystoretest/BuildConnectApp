import assert from "node:assert/strict";
import test from "node:test";
import { DisconnectReason } from "baileys";
import { shouldReconnect } from "./connection";

/**
 * A decisão de reconectar, isolada.
 *
 * Errar aqui custa nos dois sentidos: insistir num `loggedOut` é martelar uma
 * sessão que não existe mais — e martelar é o que atrai banimento; desistir
 * num `restartRequired` é ficar mudo até alguém perceber, dias depois.
 */

test("deslogado NÃO reconecta — só um QR novo resolve", () => {
  assert.equal(shouldReconnect(DisconnectReason.loggedOut), false);
});

test("bloqueado pelo WhatsApp NÃO reconecta", () => {
  // Insistir com um número banido é exatamente o comportamento que confirma
  // para a Meta que do outro lado há um robô.
  assert.equal(shouldReconnect(DisconnectReason.forbidden), false);
});

test("sessão assumida por outro aparelho NÃO reconecta", () => {
  // Voltar empurraria o outro para fora, e os dois ficariam se derrubando.
  assert.equal(shouldReconnect(DisconnectReason.connectionReplaced), false);
});

test("queda passageira reconecta", () => {
  assert.equal(shouldReconnect(DisconnectReason.connectionClosed), true);
  assert.equal(shouldReconnect(DisconnectReason.connectionLost), true);
  assert.equal(shouldReconnect(DisconnectReason.timedOut), true);
});

test("reinício exigido pelo WhatsApp reconecta", () => {
  // É o código do primeiro pareamento: o socket cai de propósito e volta.
  // Tratar como definitivo deixaria o número pareado e mudo.
  assert.equal(shouldReconnect(DisconnectReason.restartRequired), true);
});

test("código desconhecido reconecta", () => {
  // Na dúvida, tentar de novo com recuo. O caminho oposto é ficar mudo por
  // causa de um código que a biblioteca ainda não nomeou.
  assert.equal(shouldReconnect(undefined), true);
  assert.equal(shouldReconnect(9999), true);
});
