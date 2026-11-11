import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ACCESS_WINDOW_MS,
  COMPLETED_COLUMN_MS,
  accessClosed,
  accessDeadline,
  guestColumn,
} from "./access";

const agora = new Date("2026-11-03T12:00:00.000Z");
const depois = (ms: number) => new Date(agora.getTime() + ms);

// ─── Acesso ────────────────────────────────────────────────────────────────

test("convite em andamento, sem prazo, continua aberto", () => {
  assert.equal(accessClosed({ revokedAt: null, accessUntil: null }, agora), false);
});

test("revogação do DHO fecha na hora, mesmo com prazo em aberto", () => {
  const prazo = depois(ACCESS_WINDOW_MS);
  assert.equal(accessClosed({ revokedAt: agora, accessUntil: prazo }, agora), true);
});

/**
 * O caso que motivou a janela: quem acabou de concluir recebia um 404 na
 * cara. Dentro das 24 h o convite TEM de continuar abrindo.
 */
test("dentro da janela, quem concluiu ainda entra", () => {
  const prazo = accessDeadline(agora);
  assert.equal(accessClosed({ revokedAt: null, accessUntil: prazo }, agora), false);
  assert.equal(
    accessClosed({ revokedAt: null, accessUntil: prazo }, depois(ACCESS_WINDOW_MS - 1000)),
    false,
  );
});

test("vencida a janela, fecha sozinho — sem ninguém rodar nada", () => {
  const prazo = accessDeadline(agora);
  assert.equal(accessClosed({ revokedAt: null, accessUntil: prazo }, depois(ACCESS_WINDOW_MS)), true);
  assert.equal(
    accessClosed({ revokedAt: null, accessUntil: prazo }, depois(ACCESS_WINDOW_MS + 1)),
    true,
  );
});

test("a janela tem 24 horas", () => {
  assert.equal(accessDeadline(agora).getTime() - agora.getTime(), 24 * 60 * 60 * 1000);
});

// ─── Coluna do quadro ──────────────────────────────────────────────────────

test("quem não concluiu fica em pendentes", () => {
  assert.equal(guestColumn(null, agora), "PENDENTE");
});

test("recém-concluído aparece em concluídos", () => {
  assert.equal(guestColumn(agora, agora), "CONCLUIDO");
  assert.equal(guestColumn(agora, depois(COMPLETED_COLUMN_MS - 1)), "CONCLUIDO");
});

test("passados os 15 minutos, o card vai para o histórico", () => {
  assert.equal(guestColumn(agora, depois(COMPLETED_COLUMN_MS)), "HISTORICO");
  assert.equal(guestColumn(agora, depois(7 * 24 * 60 * 60 * 1000)), "HISTORICO");
});

test("a vitrine dura 15 minutos", () => {
  assert.equal(COMPLETED_COLUMN_MS, 15 * 60 * 1000);
});

/**
 * O que o pedido chama de "concluído voltando para pendente": a coluna sai de
 * `completedAt`, não da contagem de filmes aprovados, então cadastrar um filme
 * novo não mexe em quem já terminou.
 */
test("quem concluiu nunca volta a pendente", () => {
  for (const t of [0, COMPLETED_COLUMN_MS, 30 * 24 * 60 * 60 * 1000]) {
    assert.notEqual(guestColumn(agora, depois(t)), "PENDENTE");
  }
});
