-- Excluir usuário é apagar de verdade.
--
-- 1. Chamados e respostas de formulário passam a cair junto com o usuário
--    (antes: RESTRICT no chamado, que impedia a exclusão; SET NULL na resposta,
--    que deixava a resposta órfã).
ALTER TABLE "Ticket" DROP CONSTRAINT "Ticket_requesterId_fkey";
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_requesterId_fkey"
  FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FormResponse" DROP CONSTRAINT "FormResponse_respondentId_fkey";
ALTER TABLE "FormResponse" ADD CONSTRAINT "FormResponse_respondentId_fkey"
  FOREIGN KEY ("respondentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 2. Quem foi "removido" até aqui só tinha sido desativado, e as avaliações
--    dele continuavam aparecendo em Resultados. Some de vez, com tudo que é
--    dele (cascade). Os arquivos em disco desses usuários (avatar, imagens de
--    chamado) não são alcançáveis daqui e ficam para limpeza manual.
DELETE FROM "User" WHERE "active" = false;

-- 3. A pré-efetivação só é obrigatória para quem foi cadastrado a partir de
--    01/10/2026 (meia-noite em Brasília). Quem entrou antes sai do Pré-Efetivo
--    por inteiro: agenda de ciclos e avaliações já preenchidas.
DELETE FROM "EvaluationCycle" c
  USING "User" u, "EvaluationType" t
  WHERE c."subjectId" = u."id"
    AND c."typeId" = t."id"
    AND t."kind" = 'PRE_EFETIVO'
    AND u."createdAt" < TIMESTAMPTZ '2026-10-01 00:00:00-03';

DELETE FROM "Evaluation" e
  USING "User" u, "EvaluationType" t
  WHERE e."subjectId" = u."id"
    AND e."typeId" = t."id"
    AND t."kind" = 'PRE_EFETIVO'
    AND u."createdAt" < TIMESTAMPTZ '2026-10-01 00:00:00-03';
