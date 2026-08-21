/**
 * Cálculo de dias úteis (segunda a sexta), com desconto opcional de feriados.
 *
 * Hoje o projeto usa apenas fins de semana; a tabela `Holiday` está preparada
 * e, quando populada, os feriados chegam aqui via `holidays` sem mudar a lógica.
 *
 * Convenção: `addBusinessDays(from, n)` retorna a data do n-ésimo dia útil
 * *após* `from`. A contagem começa no próximo dia; se `from` cai numa
 * sexta e n=1, o resultado é a segunda seguinte. A hora é normalizada para
 * o início do dia (00:00 local) para comparações estáveis.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Chave AAAA-MM-DD para comparar feriados sem ruído de fuso/horário. */
function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function isWeekend(date: Date): boolean {
  const day = date.getDay(); // 0 = domingo, 6 = sábado
  return day === 0 || day === 6;
}

export function isBusinessDay(date: Date, holidays?: ReadonlySet<string>): boolean {
  if (isWeekend(date)) return false;
  if (holidays && holidays.has(dayKey(date))) return false;
  return true;
}

/** Constrói o conjunto de chaves de feriado a partir de uma lista de datas. */
export function holidaySet(dates: readonly Date[]): Set<string> {
  return new Set(dates.map((d) => dayKey(d)));
}

/**
 * Retorna a data do n-ésimo dia útil após `from`.
 * `n` deve ser >= 1. Fins de semana (e feriados, se fornecidos) não contam.
 */
export function addBusinessDays(
  from: Date,
  n: number,
  holidays?: ReadonlySet<string>,
): Date {
  if (n < 1) return startOfDay(from);

  const cursor = startOfDay(from);
  let counted = 0;

  while (counted < n) {
    cursor.setTime(cursor.getTime() + MS_PER_DAY);
    if (isBusinessDay(cursor, holidays)) counted += 1;
  }

  return cursor;
}

/**
 * Conta quantos dias úteis existem entre `from` (exclusivo) e `to` (inclusive).
 * Útil para exibir "faltam X dias úteis" na UI.
 */
export function businessDaysBetween(
  from: Date,
  to: Date,
  holidays?: ReadonlySet<string>,
): number {
  const start = startOfDay(from);
  const end = startOfDay(to);
  if (end <= start) return 0;

  let count = 0;
  const cursor = new Date(start);
  while (cursor < end) {
    cursor.setTime(cursor.getTime() + MS_PER_DAY);
    if (isBusinessDay(cursor, holidays)) count += 1;
  }
  return count;
}
