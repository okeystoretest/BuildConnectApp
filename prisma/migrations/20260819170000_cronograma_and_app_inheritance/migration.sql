-- Herança de aplicativos entre subsetores + ferramenta Cronograma.

-- 1) Herança: Marketing aponta para Vendas e passa a compartilhar a mesma
--    base de aplicativos e de cronograma.
ALTER TABLE "Subsector" ADD COLUMN "appsSourceId" TEXT;
ALTER TABLE "Subsector" ADD COLUMN "scheduleEnabled" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "Subsector_appsSourceId_idx" ON "Subsector"("appsSourceId");

ALTER TABLE "Subsector"
  ADD CONSTRAINT "Subsector_appsSourceId_fkey"
  FOREIGN KEY ("appsSourceId") REFERENCES "Subsector"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 2) Cronograma: etapas do funil, formatos e status de produção.
CREATE TYPE "FunnelStage" AS ENUM ('TOFU', 'MOFU', 'BOFU');
CREATE TYPE "ContentFormat" AS ENUM ('REEL', 'STORY', 'FEED', 'REEL_FEED', 'CARROSSEL', 'LIVE');
CREATE TYPE "ContentStatus" AS ENUM ('IDEIA', 'EM_PRODUCAO', 'AGENDADO', 'PUBLICADO');

CREATE TABLE "ContentPost" (
  "id"          TEXT NOT NULL,
  "title"       TEXT NOT NULL,
  "scheduledAt" TIMESTAMP(3) NOT NULL,
  "funnel"      "FunnelStage" NOT NULL,
  "format"      "ContentFormat" NOT NULL,
  "status"      "ContentStatus" NOT NULL DEFAULT 'IDEIA',
  "notes"       TEXT,
  "subsectorId" TEXT NOT NULL,
  "ownerId"     TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ContentPost_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ContentPost_subsectorId_scheduledAt_idx" ON "ContentPost"("subsectorId", "scheduledAt");
CREATE INDEX "ContentPost_ownerId_idx" ON "ContentPost"("ownerId");

ALTER TABLE "ContentPost"
  ADD CONSTRAINT "ContentPost_subsectorId_fkey"
  FOREIGN KEY ("subsectorId") REFERENCES "Subsector"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ContentPost"
  ADD CONSTRAINT "ContentPost_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
