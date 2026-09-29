-- CreateEnum
CREATE TYPE "SalesFunnelStatus" AS ENUM ('RASCUNHO', 'ATIVO', 'ARQUIVADO');

-- AlterTable
ALTER TABLE "Subsector" ADD COLUMN     "funnelEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "SalesFunnel" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "referenceDate" TIMESTAMP(3) NOT NULL,
    "goalAmount" DECIMAL(14,2) NOT NULL,
    "averageTicket" DECIMAL(14,2) NOT NULL,
    "status" "SalesFunnelStatus" NOT NULL DEFAULT 'RASCUNHO',
    "notes" TEXT,
    "subsectorId" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesFunnel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesFunnelStage" (
    "id" TEXT NOT NULL,
    "funnelId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "conversionRate" DOUBLE PRECISION NOT NULL,
    "transitionRule" TEXT,

    CONSTRAINT "SalesFunnelStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesFunnelChannel" (
    "id" TEXT NOT NULL,
    "funnelId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "strategy" TEXT,
    "share" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "SalesFunnelChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesFunnelScenario" (
    "id" TEXT NOT NULL,
    "funnelId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "ticketPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "topPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesFunnelScenario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesFunnelScenarioRate" (
    "scenarioId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "conversionRate" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "SalesFunnelScenarioRate_pkey" PRIMARY KEY ("scenarioId","stageId")
);

-- CreateIndex
CREATE INDEX "SalesFunnel_subsectorId_referenceDate_idx" ON "SalesFunnel"("subsectorId", "referenceDate");

-- CreateIndex
CREATE INDEX "SalesFunnel_subsectorId_status_idx" ON "SalesFunnel"("subsectorId", "status");

-- CreateIndex
CREATE INDEX "SalesFunnel_createdById_idx" ON "SalesFunnel"("createdById");

-- CreateIndex
CREATE INDEX "SalesFunnelStage_funnelId_idx" ON "SalesFunnelStage"("funnelId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesFunnelStage_funnelId_order_key" ON "SalesFunnelStage"("funnelId", "order");

-- CreateIndex
CREATE INDEX "SalesFunnelChannel_funnelId_idx" ON "SalesFunnelChannel"("funnelId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesFunnelChannel_funnelId_order_key" ON "SalesFunnelChannel"("funnelId", "order");

-- CreateIndex
CREATE INDEX "SalesFunnelScenario_funnelId_idx" ON "SalesFunnelScenario"("funnelId");

-- CreateIndex
CREATE INDEX "SalesFunnelScenario_createdById_idx" ON "SalesFunnelScenario"("createdById");

-- CreateIndex
CREATE INDEX "SalesFunnelScenarioRate_stageId_idx" ON "SalesFunnelScenarioRate"("stageId");

-- AddForeignKey
ALTER TABLE "SalesFunnel" ADD CONSTRAINT "SalesFunnel_subsectorId_fkey" FOREIGN KEY ("subsectorId") REFERENCES "Subsector"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesFunnel" ADD CONSTRAINT "SalesFunnel_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesFunnelStage" ADD CONSTRAINT "SalesFunnelStage_funnelId_fkey" FOREIGN KEY ("funnelId") REFERENCES "SalesFunnel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesFunnelChannel" ADD CONSTRAINT "SalesFunnelChannel_funnelId_fkey" FOREIGN KEY ("funnelId") REFERENCES "SalesFunnel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesFunnelScenario" ADD CONSTRAINT "SalesFunnelScenario_funnelId_fkey" FOREIGN KEY ("funnelId") REFERENCES "SalesFunnel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesFunnelScenario" ADD CONSTRAINT "SalesFunnelScenario_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesFunnelScenarioRate" ADD CONSTRAINT "SalesFunnelScenarioRate_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "SalesFunnelScenario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesFunnelScenarioRate" ADD CONSTRAINT "SalesFunnelScenarioRate_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "SalesFunnelStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
