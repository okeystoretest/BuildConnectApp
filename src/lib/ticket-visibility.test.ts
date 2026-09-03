import assert from "node:assert/strict";
import test from "node:test";
import { canViewTicket, filterVisibleTickets, type Viewer } from "./ticket-visibility";
import type { ItTicket, ItTicketStatus } from "@/types/it";

/**
 * Regra de visibilidade do quadro de chamados.
 *
 * O que está aqui é a regra em forma pura — a MESMA que `getItTickets`
 * reproduz como cláusula de consulta. Se um caso deste arquivo mudar, o filtro
 * do banco em `lib/it-data-db` precisa mudar junto, ou os dois lados passam a
 * discordar: a tela esconderia o que a API entrega, ou o contrário.
 */

const ANALISTA = "user-analista";
const GESTOR_QUE_ATRIBUIU = "user-gestor";
const TERCEIRO = "user-terceiro";

function ticket(patch: Partial<ItTicket> = {}): ItTicket {
  return {
    id: "t1",
    code: "RET-001",
    title: "Troca de teclado",
    category: "Equipamentos",
    requesterName: "Solicitante",
    requesterUnit: "Unidade 1",
    requesterSector: "Comercial",
    status: "PENDENTE",
    openedAt: "2026-09-03",
    openedLabel: "03/09/2026",
    timeLabel: "09:00",
    ...patch,
  };
}

const colaborador = (id: string): Viewer => ({ id, role: "COLABORADOR" });
const gestor = (id: string): Viewer => ({ id, role: "GESTOR" });
const admin = (id: string): Viewer => ({ id, role: "ADMIN" });

test("PENDENTE sem responsável é visível para todo o setor", () => {
  const t = ticket({ status: "PENDENTE" });
  assert.equal(canViewTicket(t, colaborador(TERCEIRO)), true);
  assert.equal(canViewTicket(t, gestor(TERCEIRO)), true);
});

test("PENDENTE segue público mesmo com responsável gravado", () => {
  // Estado de borda: o fluxo normal move para ATRIBUIDO junto com a
  // atribuição, mas a regra é por STATUS — pendente é pendente.
  const t = ticket({ status: "PENDENTE", assigneeId: ANALISTA, assignedById: ANALISTA });
  assert.equal(canViewTicket(t, colaborador(TERCEIRO)), true);
});

for (const status of ["ATRIBUIDO", "EM_ANDAMENTO"] as ItTicketStatus[]) {
  test(`${status}: o responsável vê`, () => {
    const t = ticket({ status, assigneeId: ANALISTA, assignedById: ANALISTA });
    assert.equal(canViewTicket(t, colaborador(ANALISTA)), true);
  });

  test(`${status}: quem atribuiu vê, mesmo não sendo o responsável`, () => {
    // Gestor distribuiu o chamado para o analista. Sem `assignedById` ele
    // perderia de vista o que acabou de encaminhar.
    const t = ticket({ status, assigneeId: ANALISTA, assignedById: GESTOR_QUE_ATRIBUIU });
    assert.equal(canViewTicket(t, gestor(GESTOR_QUE_ATRIBUIU)), true);
  });

  test(`${status}: terceiro do setor NÃO vê`, () => {
    const t = ticket({ status, assigneeId: ANALISTA, assignedById: ANALISTA });
    assert.equal(canViewTicket(t, colaborador(TERCEIRO)), false);
  });

  test(`${status}: GESTOR alheio ao chamado NÃO vê`, () => {
    // A exceção de papel é só do ADMIN. Gestor que quer acompanhar, atribui.
    const t = ticket({ status, assigneeId: ANALISTA, assignedById: ANALISTA });
    assert.equal(canViewTicket(t, gestor(TERCEIRO)), false);
  });

  test(`${status}: ADMIN vê`, () => {
    const t = ticket({ status, assigneeId: ANALISTA, assignedById: ANALISTA });
    assert.equal(canViewTicket(t, admin(TERCEIRO)), true);
  });

  test(`${status} sem responsável nem atribuidor não vaza para terceiro`, () => {
    // Dado inconsistente (status privado sem ninguém): fecha, não abre.
    const t = ticket({ status });
    assert.equal(canViewTicket(t, colaborador(TERCEIRO)), false);
  });
}

test("CONCLUIDO volta a ser visível para todo o setor", () => {
  // A equipe precisa conferir o desfecho. O prazo dessa reabertura NÃO é
  // decidido aqui: a consulta corta os concluídos com mais de 30 minutos.
  const t = ticket({
    status: "CONCLUIDO",
    assigneeId: ANALISTA,
    assignedById: ANALISTA,
    finishedAt: new Date().toISOString(),
  });
  assert.equal(canViewTicket(t, colaborador(TERCEIRO)), true);
  assert.equal(canViewTicket(t, gestor(TERCEIRO)), true);
});

test("filterVisibleTickets recorta a lista e preserva a ordem", () => {
  const tickets: ItTicket[] = [
    ticket({ id: "publico", status: "PENDENTE" }),
    ticket({ id: "meu", status: "ATRIBUIDO", assigneeId: TERCEIRO, assignedById: TERCEIRO }),
    ticket({ id: "alheio", status: "EM_ANDAMENTO", assigneeId: ANALISTA, assignedById: ANALISTA }),
    ticket({ id: "encerrado", status: "CONCLUIDO", assigneeId: ANALISTA, assignedById: ANALISTA }),
  ];

  const visible = filterVisibleTickets(tickets, colaborador(TERCEIRO)).map((t) => t.id);
  assert.deepEqual(visible, ["publico", "meu", "encerrado"]);
});
