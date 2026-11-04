-- Linha do tempo do chamado: o histórico que "Meus Chamados" exibe.
--
-- Atribuir e reatribuir SOBRESCREVEM `Ticket.assigneeId`. Quem tratou o chamado
-- antes do último responsável não estava gravado em lugar nenhum, e nenhuma
-- consulta poderia recuperá-lo. É por isso que esta tabela existe; a abertura
-- continua sendo lida de `Ticket.createdAt`, que já é a verdade sobre ela.
CREATE TABLE "TicketEvent" (
  "id"           TEXT NOT NULL,
  "ticketId"     TEXT NOT NULL,
  "status"       "TicketStatus" NOT NULL,
  "actorName"    TEXT NOT NULL,
  "assigneeName" TEXT,
  "occurredAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TicketEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TicketEvent_ticketId_occurredAt_idx" ON "TicketEvent"("ticketId", "occurredAt");

ALTER TABLE "TicketEvent" ADD CONSTRAINT "TicketEvent_ticketId_fkey"
  FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill do que os chamados antigos ainda sabem sobre si: `startedAt` e
-- `finishedAt` são carimbos reais, e o responsável atual é quem os produziu nos
-- dois casos. Sem isto, todo chamado já concluído abriria o histórico com uma
-- única linha ("aberto") — a tela nasceria vazia para toda a base.
--
-- A ATRIBUIÇÃO não é reconstruída: nunca teve data. Inventar uma seria pior que
-- a lacuna. Ids determinísticos (bf_<ticket>_<a|c>) para o backfill poder ser
-- reexecutado sem duplicar linha.
--
-- Só TI: chamado de Motoristas é do Build.Flow, e a linha do tempo dele é
-- derivada do espelho (ver `mirrorTimelineEvents`) — evento aqui seria lixo.
INSERT INTO "TicketEvent" ("id", "ticketId", "status", "actorName", "assigneeName", "occurredAt")
SELECT 'bf_' || t."id" || '_a', t."id", 'EM_ANDAMENTO',
       COALESCE(u."fullName", t."externalAssigneeName", 'Responsável anterior'),
       COALESCE(u."fullName", t."externalAssigneeName"),
       t."startedAt"
FROM "Ticket" t
LEFT JOIN "User" u ON u."id" = t."assigneeId"
WHERE t."destination" = 'TI' AND t."startedAt" IS NOT NULL
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "TicketEvent" ("id", "ticketId", "status", "actorName", "assigneeName", "occurredAt")
SELECT 'bf_' || t."id" || '_c', t."id", 'CONCLUIDO',
       COALESCE(u."fullName", t."externalAssigneeName", 'Responsável anterior'),
       COALESCE(u."fullName", t."externalAssigneeName"),
       t."finishedAt"
FROM "Ticket" t
LEFT JOIN "User" u ON u."id" = t."assigneeId"
WHERE t."destination" = 'TI' AND t."status" = 'CONCLUIDO' AND t."finishedAt" IS NOT NULL
ON CONFLICT ("id") DO NOTHING;
