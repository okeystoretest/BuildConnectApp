/**
 * A JANELA DE DATAS que o Build.Flow pede às rotas de integração.
 *
 * Vivia dentro de `api/integracao/flow/cronograma/route.ts`. Saiu de lá em
 * 06/11/2026 porque a conta de borda errava em silêncio e não havia como
 * conferi-la: importar um arquivo de rota num teste arrasta o Prisma e o
 * ambiente junto.
 *
 * TUDO EM UTC, igual ao que o banco guarda e ao que o Flow desenha. Converter
 * para o fuso de quem olha moveria uma peça de dia perto da meia-noite, e os
 * dois calendários deixariam de bater lado a lado.
 */

const DIA_MS = 86_400_000;

/**
 * `YYYY-MM-DD` da query, à meia-noite UTC.
 *
 * Valor fora do formato é IGNORADO (devolve `null`, e quem chama usa o
 * padrão), nunca erro: a data chega da URL, e um recorte inválido não deve
 * derrubar a tela do outro lado.
 */
export function dataDaQuery(valor: string | null): Date | null {
  if (!valor || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return null;
  const d = new Date(`${valor}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** A data deslocada em dias. Negativo anda para trás. */
export function emDias(base: Date, dias: number): Date {
  return new Date(base.getTime() + dias * DIA_MS);
}

/**
 * O ÚLTIMO instante do dia — a ponta de cima da janela.
 *
 * `ate` chega como DATA (`YYYY-MM-DD`) e `dataDaQuery` a lê à MEIA-NOITE. Com
 * um `lte` nessa meia-noite, tudo o que foi agendado DURANTE o último dia da
 * janela fica de fora: o dia pedido some da ponta do calendário.
 *
 * O defeito não aparecia enquanto o Flow só pedia janelas largas (+90 dias),
 * porque a ponta nunca caía num dia com conteúdo. Com o calendário de
 * mês/semana/dia (06/11/2026) a ponta passou a ser sempre um dia que alguém
 * está olhando — e na visão de Dia ela é o único dia da janela.
 */
export function fimDoDia(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999),
  );
}
