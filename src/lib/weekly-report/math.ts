/**
 * As contas que a planilha fazia em célula.
 *
 * Nenhuma delas é coluna no banco: o resultado é derivado na leitura, sempre.
 * Guardar a variação ao lado dos dois números que a produzem criaria uma
 * segunda verdade — e ela envelhece na primeira correção de um número.
 *
 * Onde a planilha devolvia `#DIV/0!` (denominador zero), aqui a resposta é
 * `undefined`, que a tela mostra como "—". Zero de base não é variação de
 * 0%: é variação que não existe.
 */

import type {
  DeliveryItem,
  KanbanSummary,
  MarketingTaskCategory,
  MarketingTaskItem,
  MarketingTaskStatus,
} from "@/types/weekly-report";

/**
 * A segunda-feira da semana de uma data, em "yyyy-mm-dd".
 *
 * Na planilha, "Período (de / até)" era digitado — e com ele o nº da semana.
 * Derivar os dois de uma data evita o erro mais comum do arquivo: a semana 46
 * com o período da 45.
 */
export function segundaDaSemana(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  // getUTCDay: 0 = domingo. O domingo pertence à semana que termina nele, por
  // isso recua 6 dias, não 1.
  const recuo = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - recuo);
  return d.toISOString().slice(0, 10);
}

/** Soma dias a uma data "yyyy-mm-dd". */
export function somarDias(iso: string, dias: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + dias * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/**
 * Nº da semana no padrão ISO-8601 (a semana 1 é a que contém a primeira
 * quinta-feira do ano).
 *
 * É o padrão brasileiro e o do Excel com `WEEKNUM(...;21)` — e o que faz
 * virada de ano cair na semana certa em vez de produzir uma semana 53 e uma
 * semana 1 com o mesmo período.
 */
export function semanaIso(iso: string): number {
  const d = new Date(`${iso}T00:00:00Z`);
  // Anda até a quinta-feira da mesma semana: é ela que define a qual ano a
  // semana pertence.
  d.setUTCDate(d.getUTCDate() + 3 - ((d.getUTCDay() + 6) % 7));
  const primeiroDeJaneiro = Date.UTC(d.getUTCFullYear(), 0, 1);
  const diasCorridos = (d.getTime() - primeiroDeJaneiro) / 86_400_000;
  // `ceil((dias + 1) / 7)`, e não `round(dias / 7) + 1`: o arredondamento
  // errava a primeira semana de um ano que começa na sexta (04/01/2027 saía
  // como semana 2).
  return Math.ceil((diasCorridos + 1) / 7);
}

export const TASK_STATUSES: readonly MarketingTaskStatus[] = [
  "BACKLOG",
  "A_FAZER",
  "EM_ANDAMENTO",
  "REVISAO",
  "PUBLICADO",
];

export const TASK_CATEGORIES: readonly MarketingTaskCategory[] = [
  "CONTEUDO",
  "PUBLICACAO",
  "COMUNIDADE",
  "RELATORIO",
  "PROCESSO",
];

/**
 * Variação entre as duas semanas, em fração (0.2 = +20%).
 *
 * `=IF(AND(ISNUMBER(C2),ISNUMBER(D2)),(D2-C2)/C2,"—")` da aba 3.
 */
export function variacao(previous?: number, current?: number): number | undefined {
  if (previous === undefined || current === undefined) return undefined;
  if (!Number.isFinite(previous) || !Number.isFinite(current)) return undefined;
  if (previous === 0) return undefined;
  return (current - previous) / previous;
}

/**
 * Quanto da meta foi atingido, em fração (1 = 100%).
 *
 * `=IF(AND(ISNUMBER(D2),ISNUMBER(C2)),D2/C2,"—")` da aba "OKRs do Trimestre".
 */
export function percentualDaMeta(achieved?: number, goalValue?: number): number | undefined {
  if (achieved === undefined || goalValue === undefined) return undefined;
  if (!Number.isFinite(achieved) || !Number.isFinite(goalValue)) return undefined;
  if (goalValue === 0) return undefined;
  return achieved / goalValue;
}

/**
 * Média das semanas apuradas, ignorando as vazias.
 *
 * `=IF(COUNT(G2:J2)=0,"—",AVERAGE(G2:J2))` — o `COUNT` do Excel não conta
 * célula vazia, então três semanas preenchidas dividem por três, nunca por
 * quatro. É isso que impede uma semana não apurada de derrubar a média.
 */
export function mediaDasSemanas(valores: readonly (number | undefined)[]): number | undefined {
  const apurados = valores.filter(
    (v): v is number => v !== undefined && Number.isFinite(v),
  );
  if (apurados.length === 0) return undefined;
  return apurados.reduce((soma, v) => soma + v, 0) / apurados.length;
}

export interface DeliveryCounts {
  onTrack: number;
  attention: number;
  blocked: number;
  /** Linhas ainda sem status — o que falta responder antes de enviar. */
  pending: number;
}

/**
 * Os três `COUNTIF` do rodapé da aba 2, mais o que ninguém contava: o vazio.
 *
 * Aceita `null` além de `undefined` para receber a linha do Prisma direto,
 * sem uma volta de conversão só para contar.
 */
export function contarEntregas(
  deliveries: readonly { health?: DeliveryItem["health"] | null }[],
): DeliveryCounts {
  let onTrack = 0;
  let attention = 0;
  let blocked = 0;
  let pending = 0;
  for (const d of deliveries) {
    if (d.health === "NO_RITMO") onTrack += 1;
    else if (d.health === "ATENCAO") attention += 1;
    else if (d.health === "TRAVADO") blocked += 1;
    else pending += 1;
  }
  return { onTrack, attention, blocked, pending };
}

/**
 * Cartão com prazo vencido e ainda não publicado.
 *
 * `=SUMPRODUCT((G<>"")*(G<TODAY())*(H<>"Publicado"))` da aba 8. O dia de HOJE
 * não conta como atraso — o prazo é até o fim dele.
 */
export function estaAtrasado(
  task: Pick<MarketingTaskItem, "dueDate" | "status">,
  hoje: string,
): boolean {
  if (!task.dueDate) return false;
  if (task.status === "PUBLICADO") return false;
  return task.dueDate < hoje;
}

/**
 * A aba 8 inteira: totais, distribuição por status e a matriz
 * categoria × status.
 *
 * `share` é fração do total (0.25 = 25%), e o total zero devolve 0 em vez de
 * `#DIV/0!` — o quadro vazio é um estado normal, não um erro.
 */
export function resumirKanban(tasks: readonly MarketingTaskItem[]): KanbanSummary {
  const total = tasks.length;

  const porStatus = new Map<MarketingTaskStatus, number>(
    TASK_STATUSES.map((s) => [s, 0]),
  );
  for (const t of tasks) {
    porStatus.set(t.status, (porStatus.get(t.status) ?? 0) + 1);
  }

  const byCategory = TASK_CATEGORIES.map((category) => {
    const counts = Object.fromEntries(TASK_STATUSES.map((s) => [s, 0])) as Record<
      MarketingTaskStatus,
      number
    >;
    let soma = 0;
    for (const t of tasks) {
      if (t.category !== category) continue;
      counts[t.status] += 1;
      soma += 1;
    }
    return { category, counts, total: soma };
  });

  return {
    total,
    published: porStatus.get("PUBLICADO") ?? 0,
    overdue: tasks.filter((t) => t.overdue).length,
    byStatus: TASK_STATUSES.map((status) => {
      const count = porStatus.get(status) ?? 0;
      return { status, count, share: total === 0 ? 0 : count / total };
    }),
    byCategory,
  };
}
