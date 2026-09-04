import assert from "node:assert/strict";
import test, { after, beforeEach } from "node:test";
import { prisma } from "@/lib/db/prisma";
import { clearAuthState, hasStoredCredentials, loadDbAuthState } from "./auth-state";

/**
 * Persistência da sessão, contra o Postgres de verdade.
 *
 * É o requisito central da integração: "a sessão deve persistir entre
 * reinicializações do servidor, sem exigir novo escaneamento a cada deploy".
 *
 * E é onde um erro passaria despercebido até o pior momento. As chaves do
 * Baileys são Buffers; um Buffer que volta do JSON como
 * `{type:"Buffer",data:[...]}` NÃO é rejeitado — ele passa, e a criptografia
 * falha depois, longe daqui, com uma mensagem que não menciona serialização.
 * O sintoma em produção seria "pede QR de novo a cada deploy", exatamente o
 * que se quis evitar.
 */

beforeEach(async () => {
  await clearAuthState();
});

after(async () => {
  await clearAuthState();
  await prisma.$disconnect();
});

test("sem credencial gravada, começa do zero (é o que faz aparecer o QR)", async () => {
  assert.equal(await hasStoredCredentials(), false);
  const { state } = await loadDbAuthState();
  assert.ok(state.creds.noiseKey, "credenciais novas foram geradas");
  // Gerar não grava: só o saveCreds grava.
  assert.equal(await hasStoredCredentials(), false);
});

test("credenciais sobrevivem ao reinício, e voltam como Buffer", async () => {
  const primeira = await loadDbAuthState();
  await primeira.saveCreds();
  assert.equal(await hasStoredCredentials(), true);

  // Segundo `loadDbAuthState` = processo reiniciado, lendo o que ficou.
  const segunda = await loadDbAuthState();

  assert.ok(
    Buffer.isBuffer(segunda.state.creds.noiseKey.private),
    "a chave voltou como Buffer, não como objeto JSON",
  );
  assert.deepEqual(
    segunda.state.creds.noiseKey.private,
    primeira.state.creds.noiseKey.private,
    "é a MESMA credencial — nenhum QR novo seria pedido",
  );
  assert.equal(segunda.state.creds.registrationId, primeira.state.creds.registrationId);
});

test("chaves de sessão vão e voltam inteiras", async () => {
  const { state } = await loadDbAuthState();

  await state.keys.set({
    "pre-key": {
      "1": { public: Buffer.from([1, 2, 3]), private: Buffer.from([4, 5, 6]) },
      "2": { public: Buffer.from([7]), private: Buffer.from([8]) },
    },
  });

  const lidas = await state.keys.get("pre-key", ["1", "2"]);
  assert.ok(Buffer.isBuffer(lidas["1"]?.private));
  assert.deepEqual(lidas["1"]?.private, Buffer.from([4, 5, 6]));
  assert.deepEqual(lidas["2"]?.public, Buffer.from([7]));
});

test("chave inexistente não vem, e não vem como nula", async () => {
  const { state } = await loadDbAuthState();
  const lidas = await state.keys.get("pre-key", ["nao-existe"]);
  assert.equal(lidas["nao-existe"], undefined);
});

test("gravar null é REMOVER, não guardar vazio", async () => {
  // O Baileys apaga chaves passando null. Guardar o null faria a chave voltar
  // como existente-porém-vazia, e a criptografia usaria lixo.
  const { state } = await loadDbAuthState();
  await state.keys.set({ "pre-key": { "9": { public: Buffer.from([1]), private: Buffer.from([2]) } } });
  assert.ok((await state.keys.get("pre-key", ["9"]))["9"]);

  await state.keys.set({ "pre-key": { "9": null } });
  const depois = await state.keys.get("pre-key", ["9"]);
  assert.equal(depois["9"], undefined);
  assert.equal(await prisma.whatsappSession.count({ where: { id: "pre-key-9" } }), 0);
});

test("desvincular apaga tudo — é a troca de número", async () => {
  const { state, saveCreds } = await loadDbAuthState();
  await saveCreds();
  await state.keys.set({ "pre-key": { "1": { public: Buffer.from([1]), private: Buffer.from([2]) } } });
  assert.ok((await prisma.whatsappSession.count()) >= 2);

  await clearAuthState();

  assert.equal(await prisma.whatsappSession.count(), 0);
  assert.equal(await hasStoredCredentials(), false);
});
