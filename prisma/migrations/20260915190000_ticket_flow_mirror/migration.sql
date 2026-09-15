-- Espelho do Build.Flow no chamado de Motoristas (ver spec 2026-09-15).
ALTER TABLE "Ticket" ADD COLUMN "flowId" TEXT;
ALTER TABLE "Ticket" ADD COLUMN "flowSyncedAt" TIMESTAMP(3);
ALTER TABLE "Ticket" ADD COLUMN "flowSyncError" TEXT;
ALTER TABLE "Ticket" ADD COLUMN "flowDriverId" TEXT;
ALTER TABLE "Ticket" ADD COLUMN "externalAssigneeName" TEXT;

CREATE UNIQUE INDEX "Ticket_flowId_key" ON "Ticket"("flowId");
