-- ============================================================
-- Build.Connect — apaga TODAS as notificações
-- ============================================================
-- Remoção definitiva (hard delete). NÃO toca em usuários, setores,
-- cronograma, chamados, avaliações ou viagens.
--
-- Como rodar (uma das opções), na raiz do app, dentro do container:
--   npx prisma db execute --file scripts/limpar-notificacoes.sql --schema prisma/schema.prisma
--   psql "$DATABASE_URL" -f scripts/limpar-notificacoes.sql
--
-- A ordem respeita a chave estrangeira: NotificationRead aponta para
-- Notification. Envolvido em transação: ou apaga tudo, ou nada.
-- ============================================================

BEGIN;

-- Marcações de "li esta notificação" (folha).
DELETE FROM "NotificationRead";

-- As notificações em si.
DELETE FROM "Notification";

COMMIT;

-- Conferência (só aparece pelo psql; o `prisma db execute` não devolve
-- resultado). Deve voltar 0 e 0:
--   SELECT
--     (SELECT COUNT(*) FROM "Notification")     AS notificacoes,
--     (SELECT COUNT(*) FROM "NotificationRead") AS leituras;
