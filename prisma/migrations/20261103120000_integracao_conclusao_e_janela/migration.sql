-- Conclusão da trilha vira FATO GRAVADO, e o acesso ganha prazo.
--
-- Antes: terminar a trilha escrevia `revokedAt` na hora. Duas consequências
-- ruins em produção — quem acabava de concluir caía num 404, e cadastrar um
-- filme novo fazia quem já terminara voltar a contar como pendente, porque
-- "concluído" era derivado de haver tentativa aprovada em TODO filme.
ALTER TABLE "IntegrationGuest" ADD COLUMN "completedAt" TIMESTAMP(3);
ALTER TABLE "IntegrationGuest" ADD COLUMN "accessUntil" TIMESTAMP(3);

CREATE INDEX "IntegrationGuest_completedAt_idx" ON "IntegrationGuest"("completedAt");

-- Backfill: quem foi fechado pelo modelo antigo TENDO aprovado todos os
-- filmes concluiu de fato. Sem isto esses convidados ficariam "Encerrado"
-- para sempre e não apareceriam no histórico. A data é a da última tentativa
-- aprovada, que é quando a trilha realmente terminou.
--
-- `accessUntil` fica nulo de propósito: quem já estava fechado continua
-- fechado por `revokedAt`, e reabrir passa a abrir uma janela nova.
UPDATE "IntegrationGuest" AS g
SET "completedAt" = sub.last_at
FROM (
  SELECT a."guestId" AS guest_id,
         MAX(a."createdAt") AS last_at,
         COUNT(DISTINCT a."assetId") AS aprovados
  FROM "IntegrationAttempt" a
  WHERE a."passed" = true
  GROUP BY a."guestId"
) AS sub
WHERE g."id" = sub.guest_id
  AND (SELECT COUNT(*) FROM "IntegrationAsset" WHERE "kind" = 'FILME') > 0
  AND sub.aprovados >= (SELECT COUNT(*) FROM "IntegrationAsset" WHERE "kind" = 'FILME');
