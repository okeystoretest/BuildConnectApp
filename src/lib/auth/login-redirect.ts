/**
 * O desvio para o login quando a sessão foi REVOGADA.
 *
 * Existe por causa de um laço infinito real: o middleware roda no Edge e só
 * consegue conferir a ASSINATURA e o PRAZO do cookie — `sessionVersion` mora no
 * banco, e o Edge não alcança o Prisma. Então, depois de trocar a senha ou o
 * papel de alguém (`user-actions.ts`, que incrementa `sessionVersion`), o
 * cookie daquela pessoa continua com assinatura válida e prazo aberto:
 *
 *   página protegida → getVerifiedSession() = null → redirect("/login")
 *   → middleware vê cookie "válido" → redirect("/")
 *   → página protegida → ... → ERR_TOO_MANY_REDIRECTS
 *
 * A saída é apagar o cookie morto. Só que apagar cookie exige Server Action,
 * Route Handler ou middleware — durante o render de um Server Component, que é
 * onde o `redirect` acontece, não dá. Por isso a página não apaga: ela MARCA a
 * URL, e o middleware, que já está no caminho do desvio, apaga e deixa passar.
 *
 * Este módulo é importado pelo middleware: nada de `node:` aqui, e nenhuma
 * dependência de `session.ts` (que usa `node:crypto` e não carrega no Edge).
 */

export const SESSION_EXPIRED_PARAM = "sessao";
export const SESSION_EXPIRED_VALUE = "expirada";

/**
 * Para onde as páginas mandam quem perdeu a sessão. Uma constante, e não a
 * string solta em cada página, porque o middleware precisa reconhecer
 * exatamente o que a página escreveu — se os dois lados divergirem, o laço
 * volta em silêncio.
 */
export const LOGIN_EXPIRED_PATH = `/login?${SESSION_EXPIRED_PARAM}=${SESSION_EXPIRED_VALUE}`;

/**
 * É o pedido de login de quem chega com um cookie morto?
 *
 * Verdadeiro só para o /login marcado. O middleware usa isto para NÃO devolver
 * a pessoa para a home — que é a volta do laço — e para apagar o cookie.
 *
 * Que a marca venha da URL, e portanto possa ser digitada por qualquer um, não
 * é brecha: o pior que alguém faz com ela é encerrar a própria sessão.
 */
export function isRevokedSessionLogin(pathname: string, params: URLSearchParams): boolean {
  if (pathname !== "/login") return false;
  return params.get(SESSION_EXPIRED_PARAM) === SESSION_EXPIRED_VALUE;
}
