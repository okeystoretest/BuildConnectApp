-- Build.Connect — apaga TODAS as notificações do banco.
--
-- Remoção definitiva (hard delete). Não mexe em mais nada: usuários, setores,
-- cronograma, chamados, avaliações e viagens ficam intactos.
--
-- A ordem importa: NotificationRead aponta para Notification.
-- Tudo numa transação — ou sai tudo, ou nada.
--
-- Como rodar, na VPS, dentro do container do app:
--   psql "$DATABASE_URL" -f scripts/limpar-notificacoes.sql

BEGIN;

DELETE FROM "NotificationRead";
DELETE FROM "Notification";

COMMIT;

-- Conferência (deve devolver 0 e 0):
SELECT
  (SELECT COUNT(*) FROM "Notification")     AS notificacoes,
  (SELECT COUNT(*) FROM "NotificationRead") AS leituras;
