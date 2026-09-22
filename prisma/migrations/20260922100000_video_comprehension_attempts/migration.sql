-- Uma resposta deixa de ser única por vídeo: cada reprovação abre uma
-- tentativa. Tudo que existe hoje é a tentativa 1 — não há backfill a
-- escrever, o DEFAULT resolve.
ALTER TABLE "VideoComprehension" ADD COLUMN "attempt" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "VideoComprehension" ADD COLUMN "staleNotifiedAt" TIMESTAMP(3);

-- O índice novo nasce ANTES de o antigo morrer: entre os dois passos a tabela
-- nunca fica sem chave, e uma reversão não deixa buraco.
CREATE UNIQUE INDEX "VideoComprehension_userId_videoId_attempt_key"
  ON "VideoComprehension"("userId", "videoId", "attempt");
CREATE INDEX "VideoComprehension_userId_videoId_idx"
  ON "VideoComprehension"("userId", "videoId");

DROP INDEX "VideoComprehension_userId_videoId_key";

CREATE TABLE "GraderAlertState" (
    "graderId" TEXT NOT NULL,
    "lastNotifiedCount" INTEGER NOT NULL DEFAULT 0,
    "lastNotifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GraderAlertState_pkey" PRIMARY KEY ("graderId")
);

ALTER TABLE "GraderAlertState" ADD CONSTRAINT "GraderAlertState_graderId_fkey"
  FOREIGN KEY ("graderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Aviso de reprovação ao colaborador. CONTEUDO significa "material novo" e
-- mentiria no sino.
ALTER TYPE "NotificationKind" ADD VALUE 'TREINAMENTO';
