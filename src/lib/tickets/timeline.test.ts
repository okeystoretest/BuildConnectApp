import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTicketTimeline,
  mirrorTimelineEvents,
  type TicketEventRow,
} from "./timeline";

function event(
  id: string,
  status: TicketEventRow["status"],
  iso: string,
  actorName = "Ana Souza",
  assigneeName: string | null = null,
): TicketEventRow {
  return { id, status, actorName, assigneeName, occurredAt: new Date(iso) };
}

const abertura = {
  createdAt: new Date("2026-11-04T12:00:00.000Z"),
  requesterName: "João Lima",
};

test("a abertura é a primeira linha, com data e hora de Brasília", () => {
  const [first] = buildTicketTimeline({ ...abertura, events: [] });
  assert.equal(first?.label, "Chamado aberto");
  assert.equal(first?.by, "João Lima");
  assert.equal(first?.atLabel, "04/11/2026 às 09:00");
});

test("os eventos seguem a abertura em ordem crescente, fora da ordem de chegada", () => {
  const timeline = buildTicketTimeline({
    ...abertura,
    events: [
      event("c", "CONCLUIDO", "2026-11-04T18:00:00.000Z"),
      event("a", "ATRIBUIDO", "2026-11-04T13:00:00.000Z", "Ana Souza", "Ana Souza"),
      event("b", "EM_ANDAMENTO", "2026-11-04T14:00:00.000Z", "Ana Souza", "Ana Souza"),
    ],
  });

  assert.deepEqual(
    timeline.map((e) => e.label),
    ["Chamado aberto", "Atribuído a Ana Souza", "Em andamento com Ana Souza", "Chamado concluído"],
  );
  assert.equal(timeline.at(-1)?.by, "Ana Souza");
});

test("designação por terceiro mostra o designado E quem designou", () => {
  const [, atribuicao] = buildTicketTimeline({
    ...abertura,
    events: [event("a", "ATRIBUIDO", "2026-11-04T13:00:00.000Z", "Carla Gestora", "Ana Souza")],
  });
  assert.equal(atribuicao?.label, "Atribuído a Ana Souza");
  assert.equal(atribuicao?.by, "Carla Gestora");
});

test("auto-atribuição não repete o nome", () => {
  const [, atribuicao] = buildTicketTimeline({
    ...abertura,
    events: [event("a", "ATRIBUIDO", "2026-11-04T13:00:00.000Z", "Ana Souza", "Ana Souza")],
  });
  assert.equal(atribuicao?.by, undefined);
});

test("cada operador que passou pelo chamado aparece, não só o último", () => {
  const timeline = buildTicketTimeline({
    ...abertura,
    events: [
      event("a", "ATRIBUIDO", "2026-11-04T13:00:00.000Z", "Ana Souza", "Ana Souza"),
      event("b", "PENDENTE", "2026-11-04T15:00:00.000Z", "Ana Souza"),
      event("c", "ATRIBUIDO", "2026-11-04T16:00:00.000Z", "Carla Gestora", "Bruno Rocha"),
      event("d", "CONCLUIDO", "2026-11-04T17:00:00.000Z", "Bruno Rocha"),
    ],
  });

  assert.deepEqual(
    timeline.map((e) => e.label),
    [
      "Chamado aberto",
      "Atribuído a Ana Souza",
      "Devolvido para a fila",
      "Atribuído a Bruno Rocha",
      "Chamado concluído",
    ],
  );
});

test("chamado de Motoristas deriva andamento e conclusão do espelho do Flow", () => {
  const events = mirrorTimelineEvents({
    id: "t1",
    status: "CONCLUIDO",
    startedAt: new Date("2026-11-04T13:00:00.000Z"),
    finishedAt: new Date("2026-11-04T14:30:00.000Z"),
    externalAssigneeName: "Pedro Motorista",
  });

  const timeline = buildTicketTimeline({ ...abertura, events });
  assert.deepEqual(
    timeline.map((e) => e.label),
    ["Chamado aberto", "Em andamento com Pedro Motorista", "Chamado concluído"],
  );
  assert.equal(timeline.at(-1)?.atLabel, "04/11/2026 às 11:30");
});

test("espelho sem corrida iniciada não inventa linha", () => {
  const events = mirrorTimelineEvents({
    id: "t2",
    status: "CONCLUIDO",
    startedAt: null,
    finishedAt: new Date("2026-11-04T14:30:00.000Z"),
    externalAssigneeName: null,
  });
  assert.deepEqual(
    events.map((e) => e.status),
    ["CONCLUIDO"],
  );
  assert.equal(events[0]?.actorName, "Logística");
});
