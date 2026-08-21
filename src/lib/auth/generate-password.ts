import crypto from "node:crypto";

/**
 * Gera uma senha aleatória forte para o cadastro de novos usuários.
 *
 * O administrador nunca digita a senha na criação — ela é gerada aqui,
 * exibida uma única vez no modal de sucesso e repassada ao colaborador.
 *
 * Estratégia: garante ao menos 1 caractere de cada classe (minúscula,
 * maiúscula, dígito, símbolo) e completa o restante a partir do alfabeto
 * completo, sempre usando `crypto.randomInt` (CSPRNG). O embaralhamento
 * final evita que a posição das classes obrigatórias seja previsível.
 *
 * Evita caracteres ambíguos (O/0, l/1/I) para reduzir erro na transcrição
 * manual das credenciais.
 */

const LOWER = "abcdefghijkmnpqrstuvwxyz"; // sem l, o
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // sem I, O
const DIGITS = "23456789"; // sem 0, 1
const SYMBOLS = "!@#$%*?-_";
const ALL = LOWER + UPPER + DIGITS + SYMBOLS;

const DEFAULT_LENGTH = 14;

function pick(alphabet: string): string {
  return alphabet.charAt(crypto.randomInt(alphabet.length));
}

export function generatePassword(length: number = DEFAULT_LENGTH): string {
  const size = Math.max(12, length);

  // Garante representação de cada classe.
  const required = [pick(LOWER), pick(UPPER), pick(DIGITS), pick(SYMBOLS)];

  const rest: string[] = [];
  for (let i = required.length; i < size; i += 1) {
    rest.push(pick(ALL));
  }

  const chars = [...required, ...rest];

  // Fisher–Yates com CSPRNG.
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(i + 1);
    const tmp = chars[i] as string;
    chars[i] = chars[j] as string;
    chars[j] = tmp;
  }

  return chars.join("");
}
