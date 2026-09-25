/**
 * A linha do tempo de atividade do colaborador: ordem, cursor e fusão.
 *
 * Nove fontes, uma página. Oito são derivadas de tabelas que já existem
 * (`ContentProgress`, `VideoComprehension`, `Ticket`…) e uma é a tabela nova
 * `ActivityEvent`, que só guarda login e logout. Aqui não há Prisma: as listas
 * chegam prontas, e o que este módulo decide é a ORDEM e o CORTE — que é onde
 * mora o risco, e o que dá para testar sem banco.
 */

/** Os dez tipos que a linha do tempo exibe. */
export type ActivityKind =
  | "CADASTRO"
  | "LOGIN"
  | "LOGOUT"
  | "VIDEO_ASSISTIDO"
  | "RESPOSTA_COMPREENSAO"
  | "AVALIACAO_VIDEO"
  | "AVALIACAO_DESIGNADA"
  | "AVALIACAO_ABERTA"
  | "AVALIACAO_RESPONDIDA"
  | "CHAMADO_ABERTO";

export interface ActivityItem {
  /**
   * Único na linha do tempo inteira, não só na tabela de origem: `TIPO:id`.
   * Ver `activityId` — o formato não é cosmético, é o desempate da ordem.
   */
  id: string;
  kind: ActivityKind;
  occurredAt: Date;
  /** Texto principal da linha, já montado. */
  title: string;
  /** Complemento, quando o evento tem o que acrescentar. */
  detail?: string;
}

/**
 * O ponto exato onde a página anterior parou.
 *
 * O par, e não só a data: duas escritas da mesma transação caem no mesmo
 * milissegundo, e um cursor de data sozinho não sabe qual das duas já foi
 * exibida — ou perde uma, ou repete.
 */
export interface ActivityCursor {
  /** ISO 8601. */
  occurredAt: string;
  id: string;
}

/** Eventos por página. */
export const ACTIVITY_PAGE_SIZE = 30;

/**
 * Id da linha do tempo: o TIPO como prefixo do id de origem.
 *
 * Não é só para evitar colisão entre tabelas. Como o tipo vem primeiro,
 * comparar dois ids como texto já ordena por tipo e depois por id — então o
 * comparador e o cursor usam UMA regra, e não duas que podem divergir.
 */
export function activityId(kind: ActivityKind, sourceId: string): string {
  return `${kind}:${sourceId}`;
}

/** Ordem total: mais recente primeiro; empate no instante decide pelo id. */
export function compareActivity(a: ActivityItem, b: ActivityItem): number {
  const byTime = b.occurredAt.getTime() - a.occurredAt.getTime();
  if (byTime !== 0) return byTime;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Este evento vem DEPOIS do cursor na ordem total?
 *
 * "Depois" numa lista decrescente é mais antigo. O próprio cursor responde
 * falso: ele é o último item já exibido.
 */
export function isAfterCursor(item: ActivityItem, cursor: ActivityCursor): boolean {
  const cursorTime = new Date(cursor.occurredAt).getTime();
  const time = item.occurredAt.getTime();
  if (time !== cursorTime) return time < cursorTime;
  return item.id > cursor.id;
}

/**
 * Funde as fontes numa página.
 *
 * O "tem mais uma página?" é demonstrável e não um chute, mas depende de quem
 * chama: cada consulta tem de pedir `pageSize + 1` linhas. Se a fusão devolver
 * mais que `pageSize`, sobrou evento e há cursor. Se devolver `pageSize` ou
 * menos, então NENHUMA fonte chegou ao teto que pediu, logo todas se
 * esgotaram e não há mais nada — é por isso que uma página cheia pode
 * terminar com cursor nulo sem mentir.
 */
export function mergeActivity(
  sources: readonly (readonly ActivityItem[])[],
  cursor?: ActivityCursor | null,
  pageSize: number = ACTIVITY_PAGE_SIZE,
): { events: ActivityItem[]; nextCursor: ActivityCursor | null } {
  const merged = sources
    .flat()
    .filter((item) => !cursor || isAfterCursor(item, cursor))
    .sort(compareActivity);

  const events = merged.slice(0, pageSize);
  const last = events[events.length - 1];
  const nextCursor =
    merged.length > pageSize && last
      ? { occurredAt: last.occurredAt.toISOString(), id: last.id }
      : null;

  return { events, nextCursor };
}
