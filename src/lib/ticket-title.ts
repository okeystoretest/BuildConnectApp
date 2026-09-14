/**
 * O chamado de TI é gravado com o título "Categoria — início da descrição"
 * (ver `createItTicket`). Onde a categoria já aparece numa tag ao lado — o
 * quadro da Retaguarda — o prefixo é redundante e sai na leitura. Em "Meus
 * Chamados" não há tag, então o título gravado continua inteiro.
 *
 * Só remove quando o prefixo é exatamente a categoria do chamado, e nunca
 * deixa o título vazio.
 */
export function stripCategoryPrefix(title: string, category: string): string {
  const prefix = `${category} — `;
  if (!title.startsWith(prefix)) return title;
  const rest = title.slice(prefix.length).trim();
  return rest || title;
}
