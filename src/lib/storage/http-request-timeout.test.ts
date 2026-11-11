import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import https from "node:https";
import { createRequire } from "node:module";
import { MAX_REQUEST_BYTES } from "./limits";

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

/**
 * O teste que amarra os três números.
 *
 * `MAX_BYTES.video`, `MAX_REQUEST_BYTES` e este timeout são a MESMA decisão
 * escrita em três arquivos. Subir o teto de bytes sem subir o timeout entrega
 * um limite mentiroso: o navegador aceita o arquivo, a barra anda, e o envio
 * morre na metade com um ECONNRESET que nenhuma tela explica.
 *
 * Então a asserção não é um número — é a CONTA. Quem subir o teto de upload e
 * esquecer o timeout quebra este teste e descobre antes de ir para produção.
 */
const BANDA_MEDIDA_BPS = 4.8 * 1000 * 1000; // produção, 09/09/2026
const FOLGA_MINIMA = 2;

test("o timeout cobre o maior envio possível na banda medida, com folga de 2x", () => {
  const segundosDoPiorEnvio = (MAX_REQUEST_BYTES * 8) / BANDA_MEDIDA_BPS;
  const segundosDoTimeout = REQUEST_TIMEOUT_MS / 1000;

  assert.ok(
    segundosDoTimeout >= segundosDoPiorEnvio * FOLGA_MINIMA,
    `o corpo aceita ${Math.round(MAX_REQUEST_BYTES / 1024 / 1024)} MB, que a ${BANDA_MEDIDA_BPS / 1e6} Mbps ` +
      `levam ~${Math.round(segundosDoPiorEnvio / 60)} min, mas o requestTimeout é de ` +
      `${Math.round(segundosDoTimeout / 60)} min — suba scripts/http-request-timeout.cjs`,
  );
});

test("o timeout não é desligado: 0 deixaria conexão aberta para sempre", () => {
  assert.ok(REQUEST_TIMEOUT_MS > 0);
  // Teto de sanidade: um dia inteiro já não é proteção nenhuma.
  assert.ok(REQUEST_TIMEOUT_MS <= 12 * 60 * 60 * 1000);
});
