import { dateLabelBR, timeLabelBR } from "@/lib/brasilia";

/**
 * A linha do tempo de UM chamado: abertura + cada mudança de status.
 *
 * A abertura é derivada de `Ticket.createdAt` (ela já tem data própria, e
 * duplicá-la em `TicketEvent` criaria duas verdades sobre o mesmo fato); o
 * resto vem dos eventos. Aqui não há Prisma: a lista chega pronta e o que este
 * módulo decide é ORDEM e RÓTULO, que é o que dá para testar sem banco.
 */

export type TicketEventStatus =
  | "PENDENTE"
  | "ATRIBUIDO"
  | "EM_ANDAMENTO"
  | "CONCLUIDO"
  | "CANCELADO";

export interface TicketEventRow {
  id: string;
  status: TicketEventStatus;
  /** Quem executou a ação. */
  actorName: string;
  /** Responsável que ficou com o chamado, quando a transição define um. */
  assigneeName: string | null;
  occurredAt: Date;
}

export interface TicketTimelineEntry {
  key: string;
  /** O fato: "Chamado aberto", "Atribuído a Ana Souza"… */
  label: string;
  /** Quem executou, quando acrescenta algo ao rótulo. */
  by?: string;
  /** "04/11/2026 às 14:32" — data E hora, no calendário de Brasília. */
  atLabel: string;
}

export interface TicketTimelineSource {
  createdAt: Date;
  requesterName: string;
  events: readonly TicketEventRow[];
}

/** Um chamado concluído na lista do botão "Histórico" de Meus Chamados. */
export interface MyTicketHistoryItem {
  id: string;
  code: string;
  title: string;
  sector: string;
  category?: string;
  timeline: TicketTimelineEntry[];
}

/**
 * Chamado de Motoristas: a linha do tempo vem do ESPELHO, não de eventos.
 *
 * O Flow é o dono desses chamados e manda o ESTADO (não transições), que o
 * webhook reaplica quantas vezes quiser — gravar um evento por escrita
 * duplicaria a mesma linha. Os carimbos que o espelho guarda já são a verdade.
 */
export function mirrorTimelineEvents(ticket: {
  id: string;
  status: string;
  startedAt: Date | null;
  finishedAt: Date | null;
  externalAssigneeName: string | null;
  assigneeName?: string | null;
}): TicketEventRow[] {
  const quem = ticket.externalAssigneeName ?? ticket.assigneeName ?? "Logística";
  const events: TicketEventRow[] = [];
  if (ticket.startedAt) {
    events.push({
      id: `${ticket.id}:andamento`,
      status: "EM_ANDAMENTO",
      actorName: quem,
      assigneeName: quem,
      occurredAt: ticket.startedAt,
    });
  }
  if (ticket.status === "CONCLUIDO" && ticket.finishedAt) {
    events.push({
      id: `${ticket.id}:conclusao`,
      status: "CONCLUIDO",
      actorName: quem,
      assigneeName: quem,
      occurredAt: ticket.finishedAt,
    });
  }
  return events;
}

function stamp(date: Date): string {
  return `${dateLabelBR(date)} às ${timeLabelBR(date)}`;
}

function describe(event: TicketEventRow): { label: string; by?: string } {
  const quem = event.assigneeName ?? event.actorName;
  switch (event.status) {
    case "ATRIBUIDO":
      return {
        label: `Atribuído a ${quem}`,
        // Auto-atribuição não repete o nome; designação por terceiro, sim.
        by: quem === event.actorName ? undefined : event.actorName,
      };
    case "EM_ANDAMENTO":
      return { label: `Em andamento com ${quem}` };
    case "PENDENTE":
      return { label: "Devolvido para a fila", by: event.actorName };
    case "CONCLUIDO":
      return { label: "Chamado concluído", by: event.actorName };
    case "CANCELADO":
      return { label: "Chamado cancelado", by: event.actorName };
  }
}

export function buildTicketTimeline(source: TicketTimelineSource): TicketTimelineEntry[] {
  const entries: TicketTimelineEntry[] = [
    {
      key: "abertura",
      label: "Chamado aberto",
      by: source.requesterName,
      atLabel: stamp(source.createdAt),
    },
  ];

  // A abertura fica fixa no topo: é o primeiro fato por definição, e um evento
  // com carimbo torto (backfill, relógio da VPS) não deveria passar na frente.
  const ordered = [...source.events].sort(
    (a, b) => a.occurredAt.getTime() - b.occurredAt.getTime() || a.id.localeCompare(b.id),
  );

  for (const event of ordered) {
    entries.push({ key: event.id, ...describe(event), atLabel: stamp(event.occurredAt) });
  }

  return entries;
}
