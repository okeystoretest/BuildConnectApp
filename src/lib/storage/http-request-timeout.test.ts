import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import https from "node:https";
import { createRequire } from "node:module";

// O preload é CJS puro (roda via NODE_OPTIONS antes do Next); carregamos
// pelo caminho real para testar exatamente o que o `start` carrega.
const req = createRequire(import.meta.url);
const { REQUEST_TIMEOUT_MS } = req("../../../scripts/http-request-timeout.cjs");

test("o preload eleva o requestTimeout de todo servidor HTTP criado depois dele", () => {
  const server = http.createServer(() => {});
  assert.equal(server.requestTimeout, REQUEST_TIMEOUT_MS);
  server.close();
});

test("vale também para HTTPS (next start --experimental-https)", () => {
  const server = https.createServer({}, () => {});
  assert.equal(server.requestTimeout, REQUEST_TIMEOUT_MS);
  server.close();
});

test("1 hora: cabe 1 GB a 4,8 Mbps (~30 min) com folga, sem desligar a proteção", () => {
  assert.equal(REQUEST_TIMEOUT_MS, 60 * 60 * 1000);
});
