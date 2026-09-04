/**
 * Telefone brasileiro: normalização, validação e máscara.
 *
 * O banco guarda SÓ DÍGITOS. Máscara é apresentação — gravar
 * "(11) 98765-4321" faria a busca por telefone depender de a pessoa ter
 * digitado os parênteses do mesmo jeito, e faria o mesmo número parecer dois
 * cadastros diferentes.
 *
 * Puro de propósito: é a regra que decide se um cadastro entra, e por isso
 * precisa de teste, não de inspeção visual.
 */

/** Tudo que não for dígito sai; o código do país, também. */
export function normalizePhone(input: string): string {
  const digits = input.replace(/\D/g, "");

  // "+55 11 98765-4321" chega como 13 dígitos; o fixo, como 12. Só nesses dois
  // tamanhos o 55 inicial é país — em 11 dígitos ele é o DDD do Rio Grande do
  // Sul, e cortá-lo destruiria o número.
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) {
    return digits.slice(2);
  }
  return digits;
}

/**
 * Formato plausível — não existência.
 *
 * Confere o que se pode conferir sem consultar operadora: tamanho, DDD e, no
 * celular, o 9 que todo número móvel tem desde 2016. É o suficiente para pegar
 * o erro comum, que é um algarismo a mais ou a menos.
 */
export function isValidPhone(digits: string): boolean {
  if (!/^\d+$/.test(digits)) return false;
  if (digits.length !== 10 && digits.length !== 11) return false;

  // Não existe DDD começando em 0, nem abaixo de 11.
  const ddd = Number(digits.slice(0, 2));
  if (ddd < 11) return false;

  // Celular: 11 dígitos, e o primeiro do número é 9.
  if (digits.length === 11 && digits[2] !== "9") return false;

  return true;
}

/**
 * Máscara para exibição.
 *
 * O que não couber num dos dois moldes volta como veio: um número gravado
 * antes desta regra não pode sumir da tela por não encaixar. Melhor cru que
 * errado.
 */
export function formatPhone(digits: string): string {
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return digits;
}
