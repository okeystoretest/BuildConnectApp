-- Cronograma: rede social da publicação.
--
-- Coluna NULA por padrão: as atividades já cadastradas continuam válidas sem
-- plataforma definida, e nem toda atividade do cronograma é um post.

CREATE TYPE "ContentPlatform" AS ENUM ('INSTAGRAM', 'TIKTOK', 'YOUTUBE');

ALTER TABLE "ContentPost" ADD COLUMN "platform" "ContentPlatform";
