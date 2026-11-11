/**
 * Quando o convite ainda abre, e em que coluna o convidado aparece.
 *
 * Puro de propósito, como `trail.ts` e `grade.ts`: as três regras abaixo são
 * lidas em lugares distintos — a página do convidado, a rota do arquivo e o
 * quadro do DHO — e o jeito de elas não divergirem é existirem uma vez só.
 *
 * Tudo sai de dois campos de `IntegrationGuest`:
 *
 *   `completedAt`  o fato de ter concluído a trilha. Gravado uma vez e nunca
 *                  apagado. Antes disto "concluído" era DERIVADO (existe
 *                  tentativa aprovada em todo filme), e bastava o DHO
 *                  cadastrar um filme novo para quem já havia terminado
 *                  voltar a contar como pendente.
 *   `accessUntil`  o fim da janela de acesso. Nasce 24 h depois da conclusão
 *                  e é renovado quando o DHO reabre. Separado de
 *                  `completedAt` porque reabrir precisa dar prazo novo SEM
 *                  reescrever quando a pessoa concluiu.
 *
 * Nada aqui agenda nada: não há cron nem gravação na leitura. A janela vence
 * por comparação de data, no momento em que alguém pergunta.
 */

/** Quanto tempo o card fica em "Concluídos" antes de ir para o histórico. */
export const COMPLETED_COLUMN_MS = 15 * 60 * 1000;

/** Quanto tempo o convite ainda abre depois de a trilha terminar. */
export const ACCESS_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface GuestAccess {
  /** Fechado à mão pelo DHO. */
  revokedAt: Date | null;
  /** Fim da janela. Null = sem prazo. */
  accessUntil: Date | null;
}

/**
 * O convite não abre mais.
 *
 * Duas vias independentes: a revogação do DHO, imediata, e o fim da janela.
 * Concluir a trilha NÃO fecha na hora — quem acabou de terminar ainda tem 24 h
 * para rever o que assistiu.
 */
export function accessClosed({ revokedAt, accessUntil }: GuestAccess, now: Date): boolean {
  if (revokedAt !== null) return true;
  return accessUntil !== null && now.getTime() >= accessUntil.getTime();
}

/** Quando a janela de acesso termina, contada a partir de agora. */
export function accessDeadline(now: Date): Date {
  return new Date(now.getTime() + ACCESS_WINDOW_MS);
}

export type GuestColumn = "PENDENTE" | "CONCLUIDO" | "HISTORICO";

/**
 * A coluna do quadro.
 *
 * "Concluídos" é a vitrine dos 15 minutos seguintes à conclusão — serve ao
 * DHO que está acompanhando agora. Passado isso o card sai da frente e vai
 * para o histórico, que é onde se consulta quem terminou dias atrás.
 */
export function guestColumn(completedAt: Date | null, now: Date): GuestColumn {
  if (completedAt === null) return "PENDENTE";
  return now.getTime() < completedAt.getTime() + COMPLETED_COLUMN_MS
    ? "CONCLUIDO"
    : "HISTORICO";
}
