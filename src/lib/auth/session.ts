import { cookies } from "next/headers";
import crypto from "node:crypto";

/**
 * Sessão mínima por cookie assinado (HMAC).
 * Suficiente para o ambiente atual. Antes de escalar, considere uma solução
 * completa (iron-session / Auth.js) e mantenha o SESSION_SECRET fora do VCS.
 */

const COOKIE_NAME = "bc_session";
const MAX_AGE_SECONDS = 60 * 60 * 8; // 8 horas

interface SessionPayload {
  userId: string;
  role: string;
  username: string;
  fullName: string;
  sector: string | null;
  /** Avatar (.webp) para exibição na sidebar sem nova ida ao banco. */
  avatarPath?: string | null;
  /**
   * Slugs de subsetor acessíveis (RBAC). `null` = ADMIN (acesso total).
   * Persistido na sessão para filtrar a navegação no client sem consulta.
   */
  accessSlugs?: string[] | null;
  /**
   * Instante (epoch em segundos) em que o token deixa de valer.
   *
   * O prazo precisa viver DENTRO do que é assinado. O maxAge do cookie é
   * instrução para o navegador — quem copiar o valor do cookie a descarta e
   * usa o token para sempre. Com "exp", quem decide é o servidor.
   */
  exp: number;
  /**
   * Cópia do User.sessionVersion no momento do login. Quem valida compara com
   * o número do banco: diferente = sessão revogada (senha trocada, papel
   * alterado, conta desativada). Ver lib/auth/require-user.ts.
   */
  v: number;
}

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 16) {
    throw new Error(
      "SESSION_SECRET ausente ou curto demais. Defina no .env (mínimo 16 caracteres).",
    );
  }
  return value;
}

function sign(data: string): string {
  return crypto.createHmac("sha256", secret()).update(data).digest("base64url");
}

export async function createSession(
  payload: Omit<SessionPayload, "exp">,
): Promise<void> {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS;
  const body = Buffer.from(JSON.stringify({ ...payload, exp })).toString("base64url");
  const token = `${body}.${sign(body)}`;

  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const [body, signature] = token.split(".");
  if (!body || !signature) return null;

  // Comparação em tempo constante evita vazar informação por timing.
  const expected = sign(body);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString(),
    ) as SessionPayload;

    // Token sem "exp" é do formato antigo (sessão perpétua): recusar em vez de
    // aceitar sem prazo. Na prática, obriga um novo login após o deploy.
    if (typeof payload.exp !== "number" || payload.exp * 1000 <= Date.now()) {
      return null;
    }
    // Sem "v" o token é anterior à revogação por versão: recusar.
    if (typeof payload.v !== "number") return null;
    return payload;
  } catch {
    return null;
  }
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export type { SessionPayload };
