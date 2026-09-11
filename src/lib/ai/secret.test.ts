import assert from "node:assert/strict";
import test from "node:test";
import { decryptSecret, encryptSecret } from "./secret";

// A chave de cifra deriva do SESSION_SECRET. O módulo só lê a variável na
// PRIMEIRA chamada (não no import), então defini-la aqui, antes de qualquer
// teste, basta.
process.env.SESSION_SECRET = "segredo-de-teste-com-bem-mais-de-dezesseis-caracteres";

test("ida e volta devolve o texto original", () => {
  const plain = "AQ.chave-de-exemplo-1234";
  assert.equal(decryptSecret(encryptSecret(plain)), plain);
});

test("cifrar duas vezes o mesmo texto produz cifras diferentes (IV aleatório)", () => {
  const plain = "mesma-chave";
  assert.notEqual(encryptSecret(plain), encryptSecret(plain));
});

test("cifra adulterada lança em vez de devolver lixo", () => {
  const cipher = encryptSecret("texto-integro");
  const [version, iv, tag, data] = cipher.split(":");
  // Troca um caractere no meio dos dados: o GCM detecta e recusa.
  const middle = Math.floor((data ?? "").length / 2);
  const swapped = data?.[middle] === "A" ? "B" : "A";
  const tampered = `${version}:${iv}:${tag}:${data?.slice(0, middle)}${swapped}${data?.slice(middle + 1)}`;
  assert.throws(() => decryptSecret(tampered));
});

test("formato desconhecido lança", () => {
  assert.throws(() => decryptSecret("v9:abc:def:ghi"), /formato/);
  assert.throws(() => decryptSecret("sem-separador"), /formato/);
});
