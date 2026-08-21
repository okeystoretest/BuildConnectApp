-- Adiciona AVALIACAO ao enum NotificationKind em migração isolada.
-- `ALTER TYPE ... ADD VALUE` não pode rodar junto de outras alterações na
-- mesma transação em Postgres < 12; manter isolado garante o commit.
ALTER TYPE "NotificationKind" ADD VALUE IF NOT EXISTS 'AVALIACAO' AFTER 'CONTEUDO';
