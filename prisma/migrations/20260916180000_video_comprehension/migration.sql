-- Instruções em Vídeo: conclusão automática aos 80 % (progresso parcial em
-- ContentProgress) e resposta de compreensão avaliada pelo Gestor (0–10).
ALTER TABLE "ContentProgress" ADD COLUMN "watchedSeconds" INTEGER;

CREATE TABLE "VideoComprehension" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "grade" INTEGER,
    "graderComment" TEXT,
    "gradedById" TEXT,
    "gradedAt" TIMESTAMP(3),

    CONSTRAINT "VideoComprehension_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VideoComprehension_userId_videoId_key" ON "VideoComprehension"("userId", "videoId");
CREATE INDEX "VideoComprehension_gradedAt_idx" ON "VideoComprehension"("gradedAt");
CREATE INDEX "VideoComprehension_videoId_idx" ON "VideoComprehension"("videoId");

ALTER TABLE "VideoComprehension" ADD CONSTRAINT "VideoComprehension_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VideoComprehension" ADD CONSTRAINT "VideoComprehension_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VideoComprehension" ADD CONSTRAINT "VideoComprehension_gradedById_fkey" FOREIGN KEY ("gradedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
