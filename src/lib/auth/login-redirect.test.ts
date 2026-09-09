import test from "node:test";
import assert from "node:assert/strict";
import {
  LOGIN_EXPIRED_PATH,
  SESSION_EXPIRED_PARAM,
  SESSION_EXPIRED_VALUE,
  isRevokedSessionLogin,
} from "./login-redirect";

/**
 * O laço que estes testes trancam:
 *
 * trocar a senha ou o papel de alguém incrementa `sessionVersion`. O cookie
 * daquela pessoa continua com assinatura e prazo válidos, então o middleware
 * (que roda no Edge e não alcança o banco) segue achando que ela está logada.
 * A página, que alcança o banco, discorda e manda para /login. O middleware
 * devolve para a home. ERR_TOO_MANY_REDIRECTS.
 *
 * O que quebra o laço é o /login MARCADO: o middleware o reconhece, apaga o
 * cookie morto e deixa passar em vez de devolver.
 */

test("o caminho de desvio carrega a marca que o middleware procura", () => {
  const url = new URL(LOGIN_EXPIRED_PATH, "https://exemplo.test");
  assert.equal(url.pathname, "/login");
  assert.equal(url.searchParams.get(SESSION_EXPIRED_PARAM), SESSION_EXPIRED_VALUE);

  // A ponta que importa: o que a página escreve é o que o middleware lê. Se
  // estes dois lados divergirem, o laço volta sem ninguém perceber.
  assert.equal(isRevokedSessionLogin(url.pathname, url.searchParams), true);
});

test("/login sem marca continua sendo o login comum", () => {
  // Este é o caso que DEVE seguir devolvendo para a home quem já está logado.
  // Sem isso, o desvio marcado não teria por que existir.
  assert.equal(isRevokedSessionLogin("/login", new URLSearchParams()), false);
});

test("marca com valor errado não vale", () => {
  const params = new URLSearchParams({ [SESSION_EXPIRED_PARAM]: "sim" });
  assert.equal(isRevokedSessionLogin("/login", params), false);
});

test("a marca só vale no /login", () => {
  // Sem esta trava, qualquer rota protegida com `?sessao=expirada` na URL
  // passaria a apagar o cookie de quem a abrisse.
  const params = new URLSearchParams({ [SESSION_EXPIRED_PARAM]: SESSION_EXPIRED_VALUE });
  assert.equal(isRevokedSessionLogin("/", params), false);
  assert.equal(isRevokedSessionLogin("/setores/vendas", params), false);
  assert.equal(isRevokedSessionLogin("/login/extra", params), false);
});
