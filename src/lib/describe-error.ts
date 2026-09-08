/**
 * Transforma um motivo de rejeição em texto de log — sem nunca lançar.
 *
 * Existe porque quem chama isto está, por definição, num lugar onde não há
 * segunda chance: o `.catch()` de uma promessa de segundo plano e o handler de
 * `unhandledRejection`. Se a formatação do erro lançar ali dentro, a exceção
 * nasce fora de qualquer ciclo de requisição e derruba o processo — que é
 * exatamente o que o handler foi escrito para impedir.
 *
 * O caso não é hipotético: `String(x)` lança quando `x` é um Proxy que
 * intercepta `toString`, ou um objeto com `Symbol.toPrimitive` defeituoso, e
 * uma promessa pode ser rejeitada com QUALQUER valor — não só com um Error.
 *
 * Módulo separado, e não um helper dentro de connection.ts, porque
 * `src/instrumentation.ts` também precisa dele: importar connection.ts de lá
 * puxaria o Baileys para dentro da subida de TODO runtime do Next.
 */
export function describeError(erro: unknown): string {
  try {
    // A pilha vale mais que a mensagem: sem ciclo de requisição, ela é a única
    // pista de onde a promessa nasceu.
    if (erro instanceof Error) return erro.stack ?? erro.message;
    return String(erro);
  } catch {
    return "(motivo ilegível)";
  }
}
