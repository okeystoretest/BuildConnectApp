-- Avaliação da qualidade do vídeo pelo colaborador. Os três critérios são
-- opcionais e independentes: quem avaliou só o áudio conta na média de áudio
-- e em mais nenhuma. Por isso nulo, e não zero.
CREATE TABLE "VideoRating" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "audio" INTEGER,
    "image" INTEGER,
    "clarity" INTEGER,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "VideoRating_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VideoRating_userId_videoId_key" ON "VideoRating"("userId", "videoId");
CREATE INDEX "VideoRating_videoId_idx" ON "VideoRating"("videoId");

ALTER TABLE "VideoRating" ADD CONSTRAINT "VideoRating_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VideoRating" ADD CONSTRAINT "VideoRating_videoId_fkey"
  FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;
