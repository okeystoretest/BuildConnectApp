-- Temporada e coleção do conteúdo de vitrine (fotos, vídeos/workshops e
-- material de apoio). Nulas: o que já existe não tem como saber a temporada,
-- e fora das vitrines os campos não são pedidos.
--
-- Não há coluna de ANO: o ano exibido e filtrado é o de `createdAt`.
ALTER TABLE "Video" ADD COLUMN "temporada" TEXT, ADD COLUMN "colecao" TEXT;
ALTER TABLE "Photo" ADD COLUMN "temporada" TEXT, ADD COLUMN "colecao" TEXT;
ALTER TABLE "Document" ADD COLUMN "temporada" TEXT, ADD COLUMN "colecao" TEXT;
