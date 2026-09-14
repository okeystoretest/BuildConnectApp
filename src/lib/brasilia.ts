/**
 * Data e hora no fuso de Brasília — ponto único.
 *
 * O servidor de produção roda em container, e container nasce em UTC. Todo
 * rótulo montado com `getHours()`/`getDate()` sai no fuso do PROCESSO, e um
 * chamado aberto às 23:30 aparecia como "02:30" do dia seguinte. No Windows
 * de desenvolvimento, que já está em Brasília, o erro não aparece — por isso
 * ele viveu tanto.
 *
 * Aqui o fuso é explícito e não depende de `TZ`: o Dockerfile também define
 * `TZ=America/Sao_Paulo` como segunda camada, mas o código não conta com ela.
 * Usa `Intl` em vez de somar/subtrair 3 h — é o ICU do Node que sabe se há
 * horário de verão, não nós.
 */

export const BRASILIA_TZ = "America/Sao_Paulo";

const PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: BRASILIA_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

interface Parts {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
}

/** Componentes do instante em Brasília, já com zero à esquerda. */
export function partsBR(date: Date): Parts {
  const out: Partial<Parts> = {};
  for (const { type, value } of PARTS.formatToParts(date)) {
    if (type === "year" || type === "month" || type === "day" || type === "hour" || type === "minute") {
      out[type] = value;
    }
  }
  return out as Parts;
}

/** "HH:MM" */
export function timeLabelBR(date: Date): string {
  const p = partsBR(date);
  return `${p.hour}:${p.minute}`;
}

/** "dd/mm/aaaa" */
export function dateLabelBR(date: Date): string {
  const p = partsBR(date);
  return `${p.day}/${p.month}/${p.year}`;
}

/** "dd/mm" */
export function dayMonthBR(date: Date): string {
  const p = partsBR(date);
  return `${p.day}/${p.month}`;
}

/** "aaaa-mm-dd" — chave de dia para agrupar e comparar. */
export function isoDateBR(date: Date): string {
  const p = partsBR(date);
  return `${p.year}-${p.month}-${p.day}`;
}

/**
 * Quantos dias de calendário (em Brasília) separam `date` de `now`. Zero é
 * "hoje", um é "ontem". Conta viradas de dia, não blocos de 24 h: 23:50 de
 * ontem visto às 00:30 de hoje é 1.
 */
export function daysAgoBR(date: Date, now: Date = new Date()): number {
  return dayNumber(now) - dayNumber(date);
}

/** Dias desde a época, no calendário de Brasília. */
function dayNumber(date: Date): number {
  const p = partsBR(date);
  return Math.round(Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day)) / 86_400_000);
}
