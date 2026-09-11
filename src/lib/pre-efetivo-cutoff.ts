/**
 * A partir de quando o Acompanhamento Pré-Efetivo é obrigatório.
 *
 * A obrigatoriedade vale só para quem foi CADASTRADO a partir de 01/10/2026.
 * Quem entrou antes não ganha agenda de ciclos, não gera pendência nem
 * notificação, e é ignorado pela varredura — regra de negócio, não de dados:
 * a data de cadastro é a âncora dos ciclos (User.createdAt), então é ela que
 * decide.
 *
 * Meia-noite no horário de Brasília, escrita com o fuso explícito para não
 * depender do TZ do servidor.
 */
export const PRE_EFETIVO_CUTOFF = new Date("2026-10-01T00:00:00-03:00");

export function isPreEfetivoRequired(createdAt: Date): boolean {
  return createdAt.getTime() >= PRE_EFETIVO_CUTOFF.getTime();
}

/** Recorte Prisma para consultas que só devem enxergar quem passa pela regra. */
export const PRE_EFETIVO_SUBJECT_WHERE = { createdAt: { gte: PRE_EFETIVO_CUTOFF } } as const;
