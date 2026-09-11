import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

/**
 * Cifra da chave da API do Gemini em repouso.
 *
 * AES-256-GCM: autenticado, então uma cifra adulterada (ou cifrada com outro
 * segredo) falha em vez de virar lixo silencioso. A chave de cifra deriva do
 * SESSION_SECRET — que já é obrigatório e validado em lib/auth/session.ts —
 * para não entrar mais uma variável de ambiente que alguém tem de gerar.
 *
 * Consequência aceita: trocar o SESSION_SECRET invalida a cifra. A tela
 * continua dizendo "chave salva", mas gerar falha com "chave ilegível" e a
 * saída é colar a chave de novo na Retaguarda.
 *
 * Formato gravado: "v1:<iv>:<tag>:<dados>", tudo em base64url. A versão na
 * frente é o que permite trocar o algoritmo um dia sem quebrar o que já está
 * no banco.
 */

const VERSION = "v1";
const SALT = "buildconnect:ai-settings";

let cachedKey: Buffer | null = null;

function key(): Buffer {
  if (cachedKey) return cachedKey;
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("SESSION_SECRET ausente ou curto demais.");
  }
  cachedKey = scryptSync(secret, SALT, 32);
  return cachedKey;
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    data.toString("base64url"),
  ].join(":");
}

export function decryptSecret(value: string): string {
  const [version, iv, tag, data] = value.split(":");
  if (version !== VERSION || !iv || !tag || !data) {
    throw new Error("Cifra em formato desconhecido.");
  }
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(data, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
