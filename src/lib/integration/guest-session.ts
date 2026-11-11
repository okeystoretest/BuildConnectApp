import { cookies } from "next/headers";
import crypto from "node:crypto";

/**
 * Identificação do CONVIDADO da Página de Integração.
 *
 * Espelha `lib/auth/session.ts` (cookie httpOnly assinado com HMAC), e é de
 * propósito que seja um cookie SEPARADO, e não um papel novo na sessão
 * existente. O isolamento é o requisito, nos dois sentidos:
 *
 *  - este cookie não abre NADA do sistema principal. Ele não tem userId, não
 *    passa pelo middleware e `getCurrentUser` nunca o lê;
 *  - um `bc_session` válido não vale aqui. A página do convidado não consulta
 *    a sessão do colaborador em momento nenhum.
 *
 * O que torna a troca IMPOSSÍVEL, e não só improvável, é a separação de
 * domínio na assinatura: o que se assina aqui é `convidado:<corpo>`. Um token
 * de sessão copiado para este cookie assina outro texto e falha a conferência,
 * mesmo com o mesmo SESSION_SECRET — e vice-versa. Trocar só o nome do cookie
 * não daria essa garantia.
 */

const COOKIE_NAME = "bc_convidado";
const MAX_AGE_SECONDS = 60 * 60 * 12; // 12 horas: cobre a integração num dia.

/** Rótulo de separação de domínio. Mudar isto invalida todos os cookies. */
const DOMAIN = "convidado";

export interface GuestPayload {
  guestId: string;
  fullName: string;
  exp: number;
}

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 16) {
    throw new Error("SESSION_SECRET ausente ou curto demais. Defina no .env (mínimo 16 caracteres).");
  }
  return value;
}

function sign(body: string): string {
  return crypto.createHmac("sha256", secret()).update(`${DOMAIN}:${body}`).digest("base64url");
}

export async function createGuestSession(
  payload: Omit<GuestPayload, "exp">,
): Promise<void> {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS;
  const body = Buffer.from(JSON.stringify({ ...payload, exp })).toString("base64url");

  const store = await cookies();
  store.set(COOKIE_NAME, `${body}.${sign(body)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    // Restrito ao módulo: o cookie não é sequer ENVIADO ao resto do sistema.
    // É defesa em profundidade — nenhuma rota de lá o aceitaria de qualquer
    // forma, mas o que não trafega não pode ser lido por engano.
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

/**
 * Lê e confere o cookie. Devolve null para ausente, forjado ou vencido.
 *
 * NÃO consulta o banco: quem confere se o convite ainda vale é quem usa este
 * payload (ver `lib/integration/data.ts`). A revogação — à mão pelo DHO, ou
 * automática no fim da trilha — precisa valer na requisição seguinte, e a
 * assinatura sozinha não sabe disso.
 */
export async function getGuestSession(): Promise<GuestPayload | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const signature = token.slice(dot + 1);

  const expected = sign(body);
  // Comparação em tempo constante, como no middleware. `timingSafeEqual`
  // explode com tamanhos diferentes, então o tamanho é conferido antes.
  if (expected.length !== signature.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as GuestPayload;
    if (typeof payload.exp !== "number" || payload.exp * 1000 <= Date.now()) return null;
    if (!payload.guestId) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function destroyGuestSession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}
