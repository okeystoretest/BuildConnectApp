-- Vídeo de boas-vindas por setor (subsetor).
--
-- Regra: ao entrar num setor pela primeira vez, o usuário assiste ao vídeo
-- daquele setor antes de acessar o conteúdo. Cada página de setor tem o seu.
--
-- Como todo arquivo do sistema, o banco guarda só o CAMINHO público
-- (/uploads/conteudo/ano/mes/arquivo.mp4). O binário fica no volume da VPS.

-- 1) O vídeo do setor.
ALTER TABLE "Subsector"
  ADD COLUMN "welcomeVideoPath"  TEXT,
  ADD COLUMN "welcomeVideoTitle" TEXT,
  ADD COLUMN "welcomeVideoAt"    TIMESTAMP(3);

-- 2) Quem já assistiu. A AUSÊNCIA da linha é o que dispara o vídeo — por isso
--    trocar o vídeo de um setor apaga as linhas dele e todos assistem de novo.
CREATE TABLE "SubsectorWelcomeView" (
    "id"          TEXT NOT NULL,
    "userId"      TEXT NOT NULL,
    "subsectorId" TEXT NOT NULL,
    "watchedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubsectorWelcomeView_pkey" PRIMARY KEY ("id")
);

-- Uma visualização por usuário/setor.
CREATE UNIQUE INDEX "SubsectorWelcomeView_userId_subsectorId_key"
  ON "SubsectorWelcomeView"("userId", "subsectorId");

CREATE INDEX "SubsectorWelcomeView_subsectorId_idx" ON "SubsectorWelcomeView"("subsectorId");
CREATE INDEX "SubsectorWelcomeView_userId_idx" ON "SubsectorWelcomeView"("userId");

ALTER TABLE "SubsectorWelcomeView"
  ADD CONSTRAINT "SubsectorWelcomeView_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SubsectorWelcomeView"
  ADD CONSTRAINT "SubsectorWelcomeView_subsectorId_fkey"
  FOREIGN KEY ("subsectorId") REFERENCES "Subsector"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
