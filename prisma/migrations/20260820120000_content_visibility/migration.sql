-- Visibilidade do post do Cronograma.
--
-- SHARED  : criado pelo Marketing. Visível para todos os setores que
--           compartilham a base (Vendas inclusive), somente leitura para quem
--           não é o autor.
-- PRIVATE : criado fora do Marketing (ex.: Vendas). Visível e editável apenas
--           pelo próprio autor (Admin mantém override).
--
-- Os registros já existentes recebem SHARED para preservar o comportamento
-- atual: nada some da agenda de ninguém depois do deploy.

CREATE TYPE "ContentVisibility" AS ENUM ('SHARED', 'PRIVATE');

ALTER TABLE "ContentPost"
  ADD COLUMN "visibility" "ContentVisibility" NOT NULL DEFAULT 'SHARED',
  ADD COLUMN "originSlug" TEXT;

-- Backfill de origem: o slug do subsetor dono da base.
UPDATE "ContentPost" AS p
SET "originSlug" = s."slug"
FROM "Subsector" AS s
WHERE s."id" = p."subsectorId" AND p."originSlug" IS NULL;

CREATE INDEX "ContentPost_subsectorId_visibility_idx"
  ON "ContentPost"("subsectorId", "visibility");
