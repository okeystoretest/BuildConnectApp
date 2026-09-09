-- Vídeo de boas-vindas da PLATAFORMA, e o registro de quem já assistiu.
--
-- Até aqui o vídeo obrigatório da primeira entrada era uma simulação: um
-- contador de 12 segundos no navegador, sem arquivo nenhum, e a marca de
-- "assistido" no localStorage. Ou seja: valia por DISPOSITIVO. Trocar de
-- navegador, limpar o site ou abrir numa janela anônima fazia o vídeo voltar,
-- e assistir num aparelho não valia no outro.
--
-- A marca passa a ser uma coluna do usuário. O vídeo do SETOR já resolvia isso
-- com a tabela SubsectorWelcomeView; aqui basta uma coluna porque o vídeo da
-- plataforma é um só — uma tabela de junção teria cardinalidade 1 e existiria
-- apenas para guardar uma data.

ALTER TABLE "User" ADD COLUMN "platformWelcomeWatchedAt" TIMESTAMP(3);

-- Linha única: o id tem default fixo, então todo upsert escreve na mesma linha
-- e não há como existirem dois vídeos disputando o mesmo papel.
CREATE TABLE "PlatformWelcomeVideo" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "path" TEXT NOT NULL,
    "title" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformWelcomeVideo_pkey" PRIMARY KEY ("id")
);
