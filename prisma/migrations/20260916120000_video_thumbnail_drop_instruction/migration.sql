-- Módulo "Instruções em Vídeo": miniatura capturada no navegador e remoção
-- da "Instrução Escrita" (anexo PDF/DOC do vídeo). Os arquivos já gravados
-- em disco para a instrução escrita ficam órfãos: só a coluna sai.
ALTER TABLE "Video" ADD COLUMN "thumbnailPath" TEXT;
ALTER TABLE "Video" DROP COLUMN "instructionPath";
