-- Costura entra em Produção, entre Corte e Acabamento.
--
-- Subsetor comum (kind PADRAO), com as mesmas ferramentas de PCP, Almoxarifado,
-- Corte, Acabamento, Revisão e Externo: base própria de aplicativos, sem
-- herança e sem Cronograma. Criação é a exceção de Produção (herda Vendas) e
-- Costura NÃO a segue.
--
-- É dado, e não esquema, e mora numa migration pelo mesmo motivo da
-- `criacao_cronograma`: o deploy roda `prisma migrate deploy` e nada mais
-- (docker-entrypoint.sh), e o seed não é executado num banco em uso. Para um
-- banco novo, o seed lê `navigation.ts` e cria a mesma linha — o upsert por
-- slug faz os dois caminhos convergirem.
--
-- Idempotente: se `costura` já existe, nada muda (nem a reordenação).

UPDATE "Subsector"
SET "order" = "order" + 1
WHERE "sectorId" = (SELECT id FROM "Sector" WHERE slug = 'producao')
  AND "order" >= 4
  AND NOT EXISTS (SELECT 1 FROM "Subsector" WHERE slug = 'costura');

INSERT INTO "Subsector" ("id", "slug", "label", "icon", "kind", "order", "sectorId")
SELECT md5(random()::text || clock_timestamp()::text), 'costura', 'Costura', 'Shirt', 'PADRAO', 4, s.id
FROM "Sector" AS s
WHERE s.slug = 'producao'
ON CONFLICT ("slug") DO NOTHING;
