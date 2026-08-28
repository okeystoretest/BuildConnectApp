/**
 * Janela de permanência de um registro encerrado no quadro.
 *
 * Encerrar NÃO tira o card do quadro na hora: ele fica visível por 30 minutos,
 * o intervalo em que a equipe ainda confere o desfecho (a solução do chamado,
 * o comprovante, a tratativa da denúncia). Passado o prazo, o registro é
 * ARQUIVADO — sai do quadro principal e passa a ser lido pelo "Histórico".
 *
 * A mesma regra vale para os quadros de Chamados (status CONCLUIDO) e para a
 * Central de Denúncias (status ENCERRADA), por isso ela mora aqui e não em um
 * dos dois módulos.
 *
 * O corte é sempre calculado NO SERVIDOR, a partir do carimbo de encerramento:
 * é a consulta que decide o que é quadro e o que é histórico, nunca o cliente.
 * Os quadros sincronizam por polling (ou por recarga da página), de modo que o
 * card desaparece sozinho quando o prazo vence.
 */

/** Janela de permanência do registro encerrado no quadro. */
export const ARCHIVE_AFTER_MS = 30 * 60 * 1000;

/**
 * Instante a partir do qual um registro encerrado ainda pertence ao quadro.
 * Encerrados com carimbo anterior a este corte já estão arquivados.
 */
export function archiveCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - ARCHIVE_AFTER_MS);
}

/**
 * Milissegundos restantes até o arquivamento. Zero quando o prazo já venceu
 * (ou quando não há carimbo — registro que sequer foi encerrado).
 */
export function msUntilArchive(closedAt: string | Date | undefined, now = Date.now()): number {
  if (!closedAt) return 0;
  const closed = closedAt instanceof Date ? closedAt.getTime() : Date.parse(closedAt);
  if (Number.isNaN(closed)) return 0;
  return Math.max(0, closed + ARCHIVE_AFTER_MS - now);
}

/** Rótulo curto do tempo restante, para o rodapé do card encerrado. */
export function archiveCountdownLabel(remainingMs: number): string {
  const minutes = Math.ceil(remainingMs / 60_000);
  if (minutes <= 0) return "Arquivando…";
  if (minutes === 1) return "Arquiva em 1 min";
  return `Arquiva em ${minutes} min`;
}
