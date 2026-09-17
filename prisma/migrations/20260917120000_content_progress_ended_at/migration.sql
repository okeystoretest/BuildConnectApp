-- Sai a regra dos 80 % (rastreio de trechos reproduzidos). O que fica é "chegou
-- ao fim": nas vitrines conclui; nas Instruções em Vídeo libera a pergunta.
ALTER TABLE "ContentProgress" DROP COLUMN "watchedIntervals",
DROP COLUMN "watchedSeconds";
ALTER TABLE "ContentProgress" RENAME COLUMN "reachedAt" TO "endedAt";
