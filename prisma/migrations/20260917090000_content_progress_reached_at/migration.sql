-- Instruções em Vídeo: os 80 % passam a só liberar a pergunta de compreensão
-- (`reachedAt`); o vídeo conta como assistido ao enviar a resposta.
ALTER TABLE "ContentProgress" ADD COLUMN "reachedAt" TIMESTAMP(3);
