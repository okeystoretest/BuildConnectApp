-- Reprovar na compreensão devolve o vídeo a pendente. Uma linha com
-- `completed = false` não pode carregar data de conclusão, então a coluna
-- passa a aceitar nulo. O DEFAULT continua valendo para quem conclui.
ALTER TABLE "ContentProgress" ALTER COLUMN "completedAt" DROP NOT NULL;
