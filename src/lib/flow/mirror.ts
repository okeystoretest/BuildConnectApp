import { z } from "zod";

/**
 * Regras PURAS do espelho do Build.Flow no `Ticket` de Motoristas.
 *
 * O Flow manda o status já no vocabulário do Connect (enum TicketStatus), o
 * nome do motorista e as datas. Aqui só validamos e traduzimos para o que o
 * `prisma.ticket.update` grava. Sem I/O: o mesmo código serve ao webhook, à
 * reconciliação e aos testes.
 */

export const flowStatusSchema = z.enum(["PENDENTE", "ATRIBUIDO", "EM_ANDAMENTO", "CONCLUIDO", "CANCELADO"]);

const isoDate = z.string().datetime({ offset: true }).nullable();

export const flowStateSchema = z.object({
  status: flowStatusSchema,
  driverName: z.string().nullable().optional().default(null),
  assignedAt: isoDate.optional().default(null),
  startedAt: isoDate.optional().default(null),
  finishedAt: isoDate.optional().default(null),
  distanceKm: z.number().nullable().optional().default(null),
  cancelReason: z.string().nullable().optional().default(null),
});

export type FlowTicketState = z.infer<typeof flowStateSchema>;

/** Espelho mais velho que isto (chamado não final) é reconsultado no Flow. */
export const RECONCILE_AFTER_MS = 60_000;

function toDate(iso: string | null): Date | null {
  return iso ? new Date(iso) : null;
}

/** Dados para `prisma.ticket.update`. Aplica o ESTADO recebido, não uma transição. */
export function mirrorUpdate(state: FlowTicketState, now: Date = new Date()) {
  return {
    status: state.status,
    externalAssigneeName: state.driverName ?? null,
    startedAt: toDate(state.startedAt ?? null),
    finishedAt: toDate(state.finishedAt ?? null),
    distanceKm: state.distanceKm ?? null,
    flowSyncedAt: now,
    flowSyncError: null as string | null,
  };
}

export function needsReconcile(
  t: { destination: string; status: string; flowId: string | null; flowSyncedAt: Date | null },
  now: Date = new Date(),
): boolean {
  if (t.destination !== "MOTORISTAS" || !t.flowId) return false;
  if (t.status === "CONCLUIDO" || t.status === "CANCELADO") return false;
  if (!t.flowSyncedAt) return true;
  return now.getTime() - t.flowSyncedAt.getTime() > RECONCILE_AFTER_MS;
}
