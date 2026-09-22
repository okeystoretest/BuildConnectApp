/**
 * Quando o Gestor é avisado de que há respostas de compreensão esperando nota.
 *
 * Puro de propósito: o banco entrega o tamanho da fila e a data do envio; a
 * decisão é testada sem ele — o mesmo desenho de `video-comprehension-scope`.
 *
 * O contador vermelho de Minhas Avaliações continua existindo. Estes avisos
 * somam a ele: o contador diz "há trabalho"; o sino cutuca.
 */

/** A cada 5 pendências na fila, um aviso. */
export const ALERT_EVERY = 5;

/** Resposta sem nota há mais dias que isto entra na varredura. */
export const STALE_DAYS = 3;

export interface QueueAlert {
  notify: boolean;
  /** Novo valor de `GraderAlertState.lastNotifiedCount`. */
  lastNotified: number;
}

/**
 * Patamar corrente da fila (múltiplo de 5 abaixo dela) contra o último
 * avisado. Subiu de patamar, avisa. Desceu, rearma — senão, uma fila que vai
 * a 10, é zerada e volta a 10 nunca mais avisaria.
 */
export function graderQueueAlert(pendingCount: number, lastNotifiedCount: number): QueueAlert {
  const level = Math.floor(pendingCount / ALERT_EVERY) * ALERT_EVERY;
  if (level > lastNotifiedCount) return { notify: true, lastNotified: level };
  return { notify: false, lastNotified: Math.min(lastNotifiedCount, level) };
}

/**
 * Escape por tempo. Sem ele, quem responde três vídeos e para nunca completa
 * um grupo de 5 — a resposta ficaria órfã esperando nota para sempre.
 * `staleNotifiedAt` garante um aviso por resposta, não um por varredura.
 */
export function isStale(submittedAt: Date, staleNotifiedAt: Date | null, now: Date): boolean {
  if (staleNotifiedAt) return false;
  return now.getTime() - submittedAt.getTime() >= STALE_DAYS * 24 * 60 * 60 * 1000;
}
