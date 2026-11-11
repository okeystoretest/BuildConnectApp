"use strict";

/**
 * Eleva o `requestTimeout` do Node para os servidores que o Next cria.
 *
 * Por que existe: o Node derruba qualquer requisição que não termine em
 * 300 s (`server.requestTimeout`, padrão desde o Node 18). O `next start` só
 * expõe `keepAliveTimeout` — não há flag nem opção de config para este. Com
 * o teto de vídeo em 4 GB (src/lib/storage/limits.ts), um envio a 4,8 Mbps
 * leva ~119 min: sem isto ele morre aos 5 min com 502 e um ECONNRESET mudo.
 *
 * Como é carregado: o script `start` do package.json roda
 * `node --require ./scripts/http-request-timeout.cjs node_modules/next/dist/bin/next start`.
 * Roda antes de qualquer código do Next e envolve `http.createServer` /
 * `https.createServer`; como o `next start` cria o servidor no MESMO processo
 * (sem fork), o patch pega o servidor de start-server.js sem servidor custom.
 * `node --require` em vez de NODE_OPTIONS para funcionar igual no Windows.
 *
 * Por que 5 h e não 0 (desligado): 0 remove a proteção contra conexões que
 * ficam abertas para sempre. 5 h cobre os ~120 min do maior envio na banda
 * medida com folga de 2,5x — e a folga é proposital: 4 h fechavam a conta por
 * 24 segundos, de modo que um único MB a mais de margem no corpo derrubaria
 * o teste que amarra os dois números.
 *
 * O preço de 4 h é real: uma conexão ociosa e maliciosa fica de pé quatro
 * horas antes de o Node derrubá-la. É aceitável aqui porque o envio de vídeo
 * é restrito a Admin e a quem administra o DHO, e porque o proxy reverso na
 * frente tem o próprio timeout. Se um dia o envio abrir para mais gente, a
 * saída é streaming multipart para o disco — não um timeout maior ainda.
 *
 * O proxy reverso na frente do container tem timeout próprio; ele precisa
 * acompanhar, senão o envio morre lá.
 */

const http = require("node:http");
const https = require("node:https");

const REQUEST_TIMEOUT_MS = 5 * 60 * 60 * 1000;

function wrap(mod) {
  const original = mod.createServer;
  mod.createServer = function createServer(...args) {
    const server = original.apply(this, args);
    server.requestTimeout = REQUEST_TIMEOUT_MS;
    // headersTimeout precisa ser menor que requestTimeout, senão o Node
    // avisa (ERR_HTTP_HEADERS_TIMEOUT) — o padrão de 60 s já é.
    server.once("listening", () => {
      console.log(
        `[http-request-timeout] requestTimeout=${REQUEST_TIMEOUT_MS / 1000}s (padrão do Node: 300s)`,
      );
    });
    return server;
  };
}

wrap(http);
wrap(https);

module.exports = { REQUEST_TIMEOUT_MS };
