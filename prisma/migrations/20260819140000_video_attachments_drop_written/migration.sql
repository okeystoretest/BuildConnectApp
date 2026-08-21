-- Módulo "Instruções em Vídeo": conteúdo auxiliar no próprio vídeo e
-- remoção integral da ferramenta "Instruções Escritas".

-- 1) Vídeo: instrução escrita + transcrição; duração deixa de existir.
ALTER TABLE "Video" ADD COLUMN "instructionPath" TEXT;
ALTER TABLE "Video" ADD COLUMN "transcriptPath" TEXT;
ALTER TABLE "Video" ADD COLUMN "transcriptText" TEXT;
ALTER TABLE "Video" DROP COLUMN "durationSec";

-- 2) Aplicativos (ex-Ferramentas): ícone da plataforma (.webp).
ALTER TABLE "ExternalLink" ADD COLUMN "iconPath" TEXT;

-- 3) Instruções Escritas: progresso, tabela e enum saem do domínio.
DELETE FROM "ContentProgress" WHERE "writtenId" IS NOT NULL;
DROP INDEX IF EXISTS "ContentProgress_userId_writtenId_key";
ALTER TABLE "ContentProgress" DROP CONSTRAINT IF EXISTS "ContentProgress_writtenId_fkey";
ALTER TABLE "ContentProgress" DROP COLUMN "writtenId";

DROP TABLE IF EXISTS "WrittenDoc";
DROP TYPE IF EXISTS "DocStatus";
