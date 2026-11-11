import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isRevokedSessionLogin } from "@/lib/auth/login-redirect";

/**
 * Proteção de rotas.
 *  - Sem sessão válida → redireciona para /login.
 *  - Com sessão válida acessando /login → redireciona para /.
 *
 * Roda no Edge runtime, que não tem `node:crypto`. A verificação da
 * assinatura usa Web Crypto (crypto.subtle) — mesmo algoritmo do session.ts
 * (HMAC-SHA256, base64url), apenas com API diferente.
 *
 * A borda confere assinatura E prazo: token com HMAC válido mas vencido não é
 * sessão. O "exp" sai do mesmo payload que o session.ts assina.
 */

const COOKIE_NAME = "bc_session";

// Rotas públicas (prefixos). O restante exige sessão.
//
// `/integracao` é a Página de Integração do convidado: módulo ISOLADO, sem
// conta no sistema. Ela não fica sem portão — tem o seu, e é outro: link de
// convite não revogado + cookie `bc_convidado` (lib/integration). O portão
// daqui não serve lá, e o de lá não abre nada daqui.
const PUBLIC_PATHS = ["/login", "/integracao"];

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
  if (diff !== 0) return false;

  // Assinatura confere; falta o prazo. O atob só entende base64 padrão, então
  // o base64url volta ao alfabeto original antes de decodificar.
  try {
    const json = atob(body.replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(json) as { exp?: number };
    return typeof payload.exp === "number" && payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  const token = request.cookies.get(COOKIE_NAME)?.value;
  const secret = process.env.SESSION_SECRET ?? "";
  const authed = token && secret ? await isValidToken(token, secret) : false;

  /**
   * Sessão REVOGADA: a página, que alcança o banco, viu que o
   * `sessionVersion` do cookie não bate mais e mandou para cá. Daqui o cookie
   * morto é apagado e o login é servido.
   *
   * Esta conferência vem ANTES da devolução para a home logo abaixo, e é o
   * que impede o laço: sem ela, a assinatura ainda válida deste cookie faz o
   * `authed` dar verdadeiro, a home devolve para o login, o login devolve
   * para a home — ERR_TOO_MANY_REDIRECTS. O Edge não tem como conferir o
   * `sessionVersion` por conta própria (não alcança o Prisma), então quem
   * sabe da revogação é a página, e ela avisa pela URL.
   */
  if (isRevokedSessionLogin(pathname, searchParams)) {
    const response = NextResponse.next();
    response.cookies.delete(COOKIE_NAME);
    return response;
  }

  // Logado tentando ver o login → manda pra home. SÓ o login: a Página de
  // Integração também é pública, e mandar quem tem sessão para a home fazia o
  // DHO cair no sistema ao abrir o convite que acabou de copiar — e punha a
  // sessão daqui decidindo sobre um módulo que não a consulta.
  if (authed && pathname === "/login") {
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
//
// `api/integracao` é o webhook do Build.Flow: máquina falando com máquina,
// autenticada por assinatura HMAC dentro da rota. Sem cookie, o middleware
// a mandaria para /login e o aviso do Flow nunca chegaria.
//
// `api/uploads` fica de fora por MEMÓRIA e TEMPO, não por acesso. Rota coberta
// pelo matcher tem o corpo inteiro bufferizado ANTES de o middleware rodar —
// é o portão que derrubava os envios de vídeo (ver RESUMO-UPLOAD.md), hoje
// aberto até 145 MB no next.config.mjs. Pagar essa cópia só para conferir um
// cookie é desperdício: a própria rota confere a sessão na primeira linha.
//
// Os ícones de `public/` ficam de fora porque o `Logo` aparece justamente nas
// telas de quem NÃO tem sessão — login e integração. Redirecionados para
// /login, viram alt text quebrado no topo das duas.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|api/health|api/cron|api/integracao|api/uploads|uploads|favicon.png|favicon.ico|build-connect-icon.png|apple-touch-icon.png).*)",
  ],
};
