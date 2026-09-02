import crypto from "node:crypto";

/**
 * Bilhete do formulário público de denúncia.
 *
 * Problema que ele resolve: a busca de destinatário roda SEM login (é o preço
 * do anonimato), e um teto por IP sozinho não impede varrer o alfabeto e
 * reconstruir o quadro de colaboradores — basta trocar de IP.
 *
 * O bilhete é emitido quando o formulário abre, é assinado (ninguém fabrica um
 * sem o SESSION_SECRET) e carrega um id próprio. Cada bilhete tem um teto de
 * buscas; conseguir bilhetes novos também é limitado. Quem quiser extrair a
 * lista precisa abrir o formulário repetidas vezes, o que é lento e aparece
 * nos contadores — em vez de disparar milhares de buscas com um script.
 *
 * Nada aqui identifica quem preenche: o id é aleatório e não é gravado junto
 * da denúncia. O anonimato do denunciante continua intacto.
 */

const TTL_SECONDS = 60 * 60;

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 16) {
    throw new Error("SESSION_SECRET ausente ou curto demais.");
  }
  return value;
}

function sign(data: string): string {
  return crypto.createHmac("sha256", secret()).update(data).digest("base64url");
}

/** Emite um bilhete novo: "<id>.<exp>.<assinatura>". */
export function issueTicket(): string {
  const id = crypto.randomBytes(12).toString("hex");
  const exp = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  const body = id + "." + exp;
  return body + "." + sign(body);
}

/**
 * Confere assinatura e prazo. Devolve o id do bilhete (chave do contador de
 * buscas) ou null quando é inválido, vencido ou forjado.
 */
export function readTicket(ticket: string | null | undefined): string | null {
  if (!ticket) return null;

  const parts = ticket.split(".");
  if (parts.length !== 3) return null;
  const [id, exp, signature] = parts as [string, string, string];

  const expected = sign(id + "." + exp);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  const expiraEm = Number(exp);
  if (!Number.isFinite(expiraEm) || expiraEm * 1000 <= Date.now()) return null;

  return id;
}
