-- Criação (Produção) passa a compartilhar a base de Vendas.
--
-- É a MESMA ligação que Marketing já tem: `appsSourceId` apontando para
-- Vendas. Com ela, Criação lê e escreve na base de Vendas — mesma agenda,
-- mesmos aplicativos, sem cópia de registro. O Cronograma aparece como aba
-- porque `resolveAppScope` devolve o `scheduleEnabled` da ORIGEM.
--
-- É dado, e não esquema, e mora numa migration por um motivo prático: o
-- deploy roda `prisma migrate deploy` e nada mais (docker-entrypoint.sh). O
-- seed não pode ser executado num banco em uso, então esta é a única via que
-- chega à produção sozinha.
--
-- Sem DELETE nem DROP: os posts e aplicativos que Criação porventura tenha
-- continuam gravados: deixam apenas de ser LIDOS, porque a leitura passa a
-- olhar a base de Vendas. Para desfazer, basta zerar o appsSourceId:
--
--   UPDATE "Subsector" SET "appsSourceId" = NULL WHERE slug = 'criacao';

UPDATE "Subsector" AS alvo
SET "appsSourceId" = origem.id,
    "scheduleEnabled" = true
FROM "Subsector" AS origem
WHERE alvo.slug = 'criacao'
  AND origem.slug = 'vendas';
