-- ============================================================
-- Build.Connect — RESET da estrutura de Avaliações
-- ============================================================
-- Apaga TODOS os dados de avaliação para re-semear do zero.
-- NÃO toca em usuários, setores, chamados, conteúdos ou mapas.
--
-- Como rodar (uma das opções):
--   psql "$DATABASE_URL" -f scripts/reset-evaluations.sql
--   npx prisma db execute --file scripts/reset-evaluations.sql --schema prisma/schema.prisma
--
-- Depois: npx prisma db seed   (recria tipos, seções, perguntas e ciclos)
--
-- A ordem respeita as dependências de chave estrangeira. Envolvido em
-- transação: ou apaga tudo, ou nada.
-- ============================================================

BEGIN;

-- Respostas das submissões (folha).
DELETE FROM "EvaluationAnswer";

-- Submissões preenchidas.
DELETE FROM "Evaluation";

-- Agenda de ciclos (Pré-Efetivo).
DELETE FROM "EvaluationCycle";

-- Formulário: perguntas → seções.
DELETE FROM "EvaluationQuestion";
DELETE FROM "EvaluationSection";

-- Instrumentos (tipos). Deixa a tabela pronta para o seed recriar.
DELETE FROM "EvaluationType";

-- Notificações geradas pela varredura de liberação de ciclos.
-- (Só as de avaliação; as demais notificações permanecem.)
DELETE FROM "NotificationRead"
  WHERE "notificationId" IN (SELECT "id" FROM "Notification" WHERE "kind" = 'AVALIACAO');
DELETE FROM "Notification" WHERE "kind" = 'AVALIACAO';

COMMIT;

-- Feriados (Holiday) NÃO são apagados: são configuração, não avaliação.
-- Se quiser zerar também, descomente:
-- DELETE FROM "Holiday";
