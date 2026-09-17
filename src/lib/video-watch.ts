/**
 * Quanto de um vídeo foi DE FATO reproduzido.
 *
 * `currentTime / duration` não serve: com os controles nativos bastaria
 * arrastar a barra para 90 % e tocar cinco segundos. O que se mede aqui é a
 * união dos trechos tocados — rever um trecho não conta duas vezes, e pular
 * um trecho deixa buraco. Puro, para ser testado sem `<video>`.
 */

/** Trecho reproduzido, em segundos: [início, fim), com início < fim. */
export type Interval = readonly [number, number];

/** Fração da duração que conta como "assistido". */
export const COMPLETION_RATIO = 0.8;

/**
 * Acrescenta um trecho à lista, fundindo com o que sobrepõe ou encosta.
 * Devolve lista nova, ordenada; ignora trecho vazio, invertido ou inválido.
 */
export function addInterval(list: readonly Interval[], start: number, end: number): Interval[] {
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [...list];

  const result: Interval[] = [];
  let s = start;
  let e = end;
  let placed = false;

  for (const [a, b] of list) {
    if (b < s) {
      // Termina antes do novo: fica como está.
      result.push([a, b]);
    } else if (a > e) {
      // Começa depois do novo: o novo entra antes dele (uma vez só).
      if (!placed) {
        result.push([s, e]);
        placed = true;
      }
      result.push([a, b]);
    } else {
      // Sobrepõe ou encosta: absorve.
      s = Math.min(s, a);
      e = Math.max(e, b);
    }
  }
  if (!placed) result.push([s, e]);
  return result;
}

/** Une duas listas (a segunda pode vir desordenada ou sobreposta). */
export function mergeIntervals(base: readonly Interval[], extra: readonly Interval[]): Interval[] {
  let result: Interval[] = [...base];
  for (const [a, b] of extra) result = addInterval(result, a, b);
  return result;
}

/**
 * Lê intervalos vindos de fora (JSON do banco, payload do cliente): só pares
 * numéricos finitos com início < fim entram; o resto é descartado em silêncio.
 * O resultado já é normalizado (ordenado e sem sobreposição).
 */
export function parseIntervals(raw: unknown): Interval[] {
  if (!Array.isArray(raw)) return [];
  let result: Interval[] = [];
  for (const item of raw) {
    if (!Array.isArray(item) || item.length !== 2) continue;
    const [a, b] = item as unknown[];
    if (typeof a !== "number" || typeof b !== "number") continue;
    result = addInterval(result, a, b);
  }
  return result;
}

/** Total de segundos únicos reproduzidos. */
export function watchedSeconds(list: readonly Interval[]): number {
  let total = 0;
  for (const [a, b] of list) total += b - a;
  return total;
}

/** O vídeo conta como assistido: 80 % da duração reproduzidos. */
export function isComplete(watched: number, duration: number): boolean {
  if (!Number.isFinite(duration) || duration <= 0) return false;
  if (!Number.isFinite(watched)) return false;
  // Tolerância de ponto flutuante: 0.8 * 10 dá 8.000000000000002.
  return watched + 1e-6 >= duration * COMPLETION_RATIO;
}
