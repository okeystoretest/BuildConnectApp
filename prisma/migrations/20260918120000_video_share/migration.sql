-- Compartilhamento de vídeo entre subsetores: mesma linha de Video, mesmo
-- arquivo em disco, uma linha de permissão por destino.
CREATE TABLE "VideoShare" (
    "videoId" TEXT NOT NULL,
    "subsectorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VideoShare_pkey" PRIMARY KEY ("videoId","subsectorId")
);

CREATE INDEX "VideoShare_subsectorId_idx" ON "VideoShare"("subsectorId");

ALTER TABLE "VideoShare" ADD CONSTRAINT "VideoShare_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VideoShare" ADD CONSTRAINT "VideoShare_subsectorId_fkey" FOREIGN KEY ("subsectorId") REFERENCES "Subsector"("id") ON DELETE CASCADE ON UPDATE CASCADE;
