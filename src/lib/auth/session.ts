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

export async function createSession(payload: SessionPayload): Promise<void> {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
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
    return JSON.parse(Buffer.from(body, "base64url").toString()) as SessionPayload;
  } catch {
    return null;
  }
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export type { SessionPayload };
