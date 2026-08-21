-- Cronograma: marca do conteúdo (cor do card) e autoria do registro.

-- 1) Marca opcional. Sem marca, o card mantém a cor padrão da interface.
CREATE TYPE "ContentBrand" AS ENUM ('OKEY', 'LOV_CLUB');
ALTER TABLE "ContentPost" ADD COLUMN "brand" "ContentBrand";

-- 2) Autoria: quem criou é quem pode editar depois.
ALTER TABLE "ContentPost" ADD COLUMN "createdById" TEXT;

CREATE INDEX "ContentPost_createdById_idx" ON "ContentPost"("createdById");

ALTER TABLE "ContentPost"
  ADD CONSTRAINT "ContentPost_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Posts já existentes não têm autor registrado. O responsável é a melhor
-- aproximação disponível — sem isso ninguém conseguiria editá-los.
UPDATE "ContentPost" SET "createdById" = "ownerId" WHERE "createdById" IS NULL;
