import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Proteção de rotas.
 *  - Sem sessão válida → redireciona para /login.
 *  - Com sessão válida acessando /login → redireciona para /.
 *
 * Roda no Edge runtime, que não tem `node:crypto`. A verificação da
 * assinatura usa Web Crypto (crypto.subtle) — mesmo algoritmo do session.ts
 * (HMAC-SHA256, base64url), apenas com API diferente.
 */

const COOKIE_NAME = "bc_session";

// Rotas públicas (prefixos). O restante exige sessão.
const PUBLIC_PATHS = ["/login"];

function bytesToBase64url(bytes: ArrayBuffer): string {
  const arr = new Uint8Array(bytes);
  let binary = "";
  for (const b of arr) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function isValidToken(token: string, secret: string): Promise<boolean> {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return false;
  const body = token.slice(0, dot);
  const signature = token.slice(dot + 1);

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const expectedBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  const expected = bytesToBase64url(expectedBuf);

  // Comparação em tempo constante.
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) {
    diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return diff === 0;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  const token = request.cookies.get(COOKIE_NAME)?.value;
  const secret = process.env.SESSION_SECRET ?? "";
  const authed = token && secret ? await isValidToken(token, secret) : false;

  // Logado tentando ver o login → manda pra home.
  if (authed && isPublic) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // Não logado em rota protegida → manda pro login.
  if (!authed && !isPublic) {
    const url = new URL("/login", request.url);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

// Aplica a tudo, exceto assets estáticos, imagens do Next, uploads e favicon.
//
// `api/health` e `api/cron` também ficam de fora, e não por serem públicas:
// elas não têm cookie de sessão para apresentar. O health check do Easy Panel
// receberia 302 para /login e marcaria o container como saudável pelo motivo
// errado; a rota de cron já se autentica sozinha pelo CRON_SECRET e hoje nunca
// chega a executar — o middleware a redireciona antes.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|api/health|api/cron|uploads|favicon.png|favicon.ico).*)",
  ],
};
