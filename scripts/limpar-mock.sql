-- ============================================================================
-- Remoção dos dados de demonstração do banco
-- ============================================================================
--
-- Contrapartida, no banco, da limpeza feita no código: o seed não cria mais os
-- quatro usuários fictícios (Ana Ribeiro, Carlos Mendes, Beatriz Souza e Pedro
-- Dias), mas quem já rodou o seed antes tem essas linhas gravadas.
--
-- LEIA ANTES DE EXECUTAR. Este script APAGA dados e não tem volta.
--
-- Ordem de leitura:
--   1. Rode o bloco de INSPEÇÃO e confira o que vai sair.
--   2. Garanta que existe OUTRO administrador ativo (passo 2) — apagar a
--      Beatriz sem substituto tranca a aplicação para todo mundo.
--   3. Só então rode o bloco de REMOÇÃO.
--
-- Faça um dump antes:
--   pg_dump -Fc -f backup-antes-da-limpeza.dump "$DATABASE_URL"
--
-- ============================================================================

-- ─── 1. INSPEÇÃO (não altera nada) ─────────────────────────────────────────

-- Usuários de demonstração ainda presentes.
SELECT "id", "username", "fullName", "role", "active", "createdAt"
FROM "User"
WHERE "username" IN ('ana#BC', 'carlos#BC', 'beatriz#BC', 'pedro#BC');

-- O que está pendurado neles. Se algum número aqui for alto, pare e decida:
-- pode haver trabalho real registrado sob um usuário de demonstração.
SELECT
  u."username",
  (SELECT count(*) FROM "Ticket" t WHERE t."requesterId" = u."id")        AS chamados_abertos,
  (SELECT count(*) FROM "Ticket" t WHERE t."assigneeId" = u."id")         AS chamados_atribuidos,
  (SELECT count(*) FROM "Evaluation" e WHERE e."subjectId" = u."id")      AS avaliacoes_recebidas,
  (SELECT count(*) FROM "Evaluation" e WHERE e."evaluatorId" = u."id")    AS avaliacoes_feitas,
  (SELECT count(*) FROM "ContentProgress" c WHERE c."userId" = u."id")    AS progresso_conteudo
FROM "User" u
WHERE u."username" IN ('ana#BC', 'carlos#BC', 'beatriz#BC', 'pedro#BC');

-- Chamados de demonstração: código no formato ANTIGO "#2051"/"#3021". Os
-- chamados reais usam os prefixos RET- e MOT- (ver nextTicketCode em
-- src/lib/tickets/actions.ts), então este recorte não pega nada de verdade.
SELECT "id", "code", "destination", "status", "title", "createdAt"
FROM "Ticket"
WHERE "code" ~ '^#[0-9]+$'
ORDER BY "createdAt";

-- Administradores ativos. PRECISA sobrar pelo menos um fora da lista acima.
SELECT "username", "fullName", "active"
FROM "User"
WHERE "role" = 'ADMIN' AND "active" = true;


-- ─── 2. ANTES DE APAGAR: garanta um administrador ──────────────────────────
--
-- Se a consulta anterior devolveu só a 'beatriz#BC', crie o admin definitivo
-- ANTES de removê-la. A forma correta é pelo seed, que gera o hash bcrypt:
--
--   SEED_PASSWORD="senha-forte-aqui" \
--   ADMIN_USERNAME="seunome#BC" \
--   ADMIN_FULLNAME="Seu Nome" \
--   npx prisma db seed
--
-- Depois confirme aqui e faça login com ele antes de seguir:
--   SELECT "username" FROM "User" WHERE "role" = 'ADMIN' AND "active" = true;
--
-- Não crie admin por INSERT direto: a coluna passwordHash espera bcrypt, e
-- senha em texto puro grava uma conta com a qual ninguém consegue entrar.


-- ─── 3. REMOÇÃO ────────────────────────────────────────────────────────────
--
-- Em transação: se qualquer passo falhar, nada é aplicado. Confira o resultado
-- do SELECT final e só então troque o ROLLBACK pelo COMMIT.

BEGIN;

-- 3.1 Chamados de demonstração (código no formato antigo "#NNNN").
--     TicketImage e Trip/TripPosition saem por cascade do schema.
DELETE FROM "Ticket" WHERE "code" ~ '^#[0-9]+$';

-- 3.2 Usuários de demonstração.
--
--     O que sai por CASCADE junto do usuário: UserSubsector,
--     SubsectorWelcomeView, ContentProgress, NotificationRead, as notificações
--     direcionadas a ele (Notification.targetUserId), e — enquanto AVALIADO —
--     Evaluation.subjectId, EvaluationCycle, EvaluationRound e
--     EvaluationAssignment (com as respostas da rodada).
--
--     O que fica com a referência ANULADA (SetNull), preservando a linha:
--     Ticket.assigneeId, Ticket.assignedById, Evaluation.evaluatorId (o
--     resultado sobrevive, sem o nome de quem avaliou), ContentPost.ownerId e
--     .createdById, IntegrationMap.userId e Report.targetUserId.
--
--     Ticket.requesterId é obrigatório e NÃO tem SetNull: um chamado aberto por
--     usuário de demonstração impede a exclusão dele. Se a inspeção acusou
--     chamados_abertos > 0 fora do formato "#NNNN", decida caso a caso — ou o
--     chamado é descartável (apague-o), ou o usuário não é descartável (mantenha
--     a conta e apenas desative com active = false).
DELETE FROM "User"
WHERE "username" IN ('ana#BC', 'carlos#BC', 'beatriz#BC', 'pedro#BC');

-- 3.3 Notificações de demonstração que citam os chamados removidos.
DELETE FROM "Notification" WHERE "body" ~ '#[0-9]+ ·';

-- 3.4 Conferência. As duas primeiras linhas do resultado precisam vir com
--     total = 0; a terceira, com total >= 1.
SELECT 'usuarios restantes' AS verificacao, count(*) AS total
FROM "User" WHERE "username" IN ('ana#BC', 'carlos#BC', 'beatriz#BC', 'pedro#BC')
UNION ALL
SELECT 'chamados de demo restantes', count(*)
FROM "Ticket" WHERE "code" ~ '^#[0-9]+$'
UNION ALL
SELECT 'admins ativos (precisa ser >= 1)', count(*)
FROM "User" WHERE "role" = 'ADMIN' AND "active" = true;

-- Trocar por COMMIT quando o resultado acima estiver correto.
ROLLBACK;
