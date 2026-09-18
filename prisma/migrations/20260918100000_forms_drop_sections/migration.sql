-- Seções saem do Construtor de Formulários do DHO. A pergunta passa a ligar
-- direto ao formulário; a ordem global preserva "seção, depois pergunta" para
-- que formulários já publicados não embaralhem.

ALTER TABLE "FormQuestion" ADD COLUMN "formId" TEXT;

UPDATE "FormQuestion" q
SET "formId" = s."formId"
FROM "FormSection" s
WHERE q."sectionId" = s."id";

UPDATE "FormQuestion" q
SET "order" = ranked.rn
FROM (
  -- Empate de "order" dentro da seção não pode sortear a ordem: o id da
  -- pergunta é o desempate final, determinístico.
  SELECT q2."id",
         ROW_NUMBER() OVER (PARTITION BY s."formId" ORDER BY s."order", q2."order", q2."id") - 1 AS rn
  FROM "FormQuestion" q2
  JOIN "FormSection" s ON s."id" = q2."sectionId"
) ranked
WHERE ranked."id" = q."id";

ALTER TABLE "FormQuestion" ALTER COLUMN "formId" SET NOT NULL;

ALTER TABLE "FormQuestion" DROP CONSTRAINT "FormQuestion_sectionId_fkey";
DROP INDEX "FormQuestion_sectionId_order_idx";
ALTER TABLE "FormQuestion" DROP COLUMN "sectionId";

CREATE INDEX "FormQuestion_formId_order_idx" ON "FormQuestion"("formId", "order");
ALTER TABLE "FormQuestion" ADD CONSTRAINT "FormQuestion_formId_fkey"
  FOREIGN KEY ("formId") REFERENCES "Form"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DROP TABLE "FormSection";
