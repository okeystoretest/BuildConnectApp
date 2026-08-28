-- Cronograma: seleção múltipla de redes sociais e revisão dos formatos.
--
--  1. `platform` (uma rede) vira `platforms` (lista). O valor existente é
--     preservado como lista de um elemento — nenhum post perde a rede.
--  2. O formato "Reel + Feed" sai do vocabulário; os posts que o usavam
--     passam a "Feed", que é a opção mantida.
--  3. Entra o formato "Outro", com o texto digitado em `formatOther`.

-- 1. Redes sociais: coluna única → lista.
ALTER TABLE "ContentPost"
  ADD COLUMN "platforms" "ContentPlatform"[] NOT NULL DEFAULT ARRAY[]::"ContentPlatform"[];

UPDATE "ContentPost"
  SET "platforms" = ARRAY["platform"]
  WHERE "platform" IS NOT NULL;

ALTER TABLE "ContentPost" DROP COLUMN "platform";

-- 2 e 3. Enum de formato recriado: REEL_FEED sai, OUTRO entra. Recriar o tipo
-- (em vez de ALTER TYPE ... ADD VALUE) é o que permite REMOVER um valor e usar
-- o novo dentro da mesma transação da migração.
CREATE TYPE "ContentFormat_new" AS ENUM ('REEL', 'STORY', 'FEED', 'CARROSSEL', 'LIVE', 'OUTRO');

ALTER TABLE "ContentPost"
  ALTER COLUMN "format" TYPE "ContentFormat_new"
  USING (CASE WHEN "format"::text = 'REEL_FEED' THEN 'FEED' ELSE "format"::text END)::"ContentFormat_new";

ALTER TYPE "ContentFormat" RENAME TO "ContentFormat_old";
ALTER TYPE "ContentFormat_new" RENAME TO "ContentFormat";
DROP TYPE "ContentFormat_old";

-- Texto livre do formato "Outro".
ALTER TABLE "ContentPost" ADD COLUMN "formatOther" TEXT;
