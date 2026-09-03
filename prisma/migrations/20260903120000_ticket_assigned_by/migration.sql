-- Autor da atribuição do chamado.
--
-- O quadro passa a esconder chamado ATRIBUIDO/EM_ANDAMENTO de quem não é parte
-- dele. Sem registrar quem atribuiu, o gestor que designasse outra pessoa
-- perderia o chamado de vista no instante seguinte. Quando o analista assume o
-- chamado para si, esta coluna fica igual a "assigneeId".
--
-- Retroativo: chamados que JÁ estão atribuídos herdam o próprio responsável
-- como atribuidor. É a leitura correta do caso comum (auto-atribuição) e evita
-- que o histórico existente fique invisível para todo mundo depois do deploy.

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "assignedById" TEXT;

-- CreateIndex
CREATE INDEX "Ticket_assignedById_idx" ON "Ticket"("assignedById");

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill
UPDATE "Ticket" SET "assignedById" = "assigneeId" WHERE "assigneeId" IS NOT NULL;
