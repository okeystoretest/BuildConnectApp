-- Página de Integração: gabarito próprio, convite pessoal e tentativas.
--
-- O que muda, e por quê:
--
--  1. O questionário deixa de ser um `Form` do DHO e ganha tabelas próprias
--     COM GABARITO. Formulário de avaliação e de pesquisa não tem resposta
--     certa; marcar "esta é a correta" lá dentro espalharia um conceito de
--     prova por um motor feito para colher opinião.
--
--  2. `IntegrationLink` e `IntegrationGuest` viram UMA tabela. O convite
--     passou a exigir nome e telefone do destinatário — deixou de ser
--     compartilhável e virou pessoal, então as duas viraram a mesma linha.
--
--  3. `IntegrationProgress` dá lugar a `IntegrationAttempt`: quem não alcança
--     a nota refaz, e cada rodada fica gravada.
--
-- OS CONVITES EXISTENTES SÃO PRESERVADOS. Eles passam por uma tabela
-- temporária e voltam com o nome que o convidado havia confirmado. Ficam sem
-- telefone (a coluna é anulável exatamente por isso) e apenas não recebem
-- aviso por WhatsApp.
--
-- Para desfazer: não há caminho de volta automático — as respostas gravadas no
-- motor de formulários foram apagadas junto com os questionários. Restaure de
-- backup.

-- ─── Preserva os convites antes de derrubar as tabelas ─────────────────────

CREATE TEMP TABLE "_convites" AS
SELECT DISTINCT ON (l."id")
  l."id",
  l."token",
  COALESCE(g."fullName", l."label") AS "fullName",
  l."revokedAt",
  g."createdAt" AS "confirmedAt",
  l."createdById",
  l."createdAt"
FROM "IntegrationLink" l
LEFT JOIN "IntegrationGuest" g ON g."linkId" = l."id"
ORDER BY l."id", g."createdAt" ASC;

-- ─── O convidado sai do motor de formulários ───────────────────────────────

-- Os questionários de filme eram Form comuns. Apagados AQUI, antes de a
-- coluna que os identifica sumir — senão ficariam como formulários órfãos da
-- empresa na lista do DHO, sem destinatário e sem ninguém que os tenha criado.
DELETE FROM "Form"
WHERE "id" IN (SELECT "formId" FROM "IntegrationAsset" WHERE "formId" IS NOT NULL);

ALTER TABLE "FormResponse" DROP CONSTRAINT "FormResponse_guestId_fkey";
DROP INDEX "FormResponse_guestId_idx";
ALTER TABLE "FormResponse" DROP COLUMN "guestId";

ALTER TABLE "IntegrationAsset" DROP CONSTRAINT "IntegrationAsset_formId_fkey";
DROP INDEX "IntegrationAsset_formId_key";
ALTER TABLE "IntegrationAsset" DROP COLUMN "formId";

-- ─── Convite e convidado viram uma tabela só ───────────────────────────────

DROP TABLE "IntegrationProgress";
DROP TABLE "IntegrationGuest";
DROP TABLE "IntegrationLink";

CREATE TABLE "IntegrationGuest" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrationGuest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IntegrationGuest_token_key" ON "IntegrationGuest"("token");
CREATE INDEX "IntegrationGuest_revokedAt_idx" ON "IntegrationGuest"("revokedAt");

ALTER TABLE "IntegrationGuest"
  ADD CONSTRAINT "IntegrationGuest_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "IntegrationGuest"
  ("id", "token", "fullName", "phone", "confirmedAt", "revokedAt", "createdById", "createdAt")
SELECT "id", "token", "fullName", NULL, "confirmedAt", "revokedAt", "createdById", "createdAt"
FROM "_convites";

DROP TABLE "_convites";

-- ─── Perguntas, gabarito e tentativas ──────────────────────────────────────

CREATE TABLE "IntegrationQuestion" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "IntegrationQuestion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "IntegrationQuestion_assetId_order_idx" ON "IntegrationQuestion"("assetId", "order");

ALTER TABLE "IntegrationQuestion"
  ADD CONSTRAINT "IntegrationQuestion_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "IntegrationAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "IntegrationOption" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "correct" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "IntegrationOption_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "IntegrationOption_questionId_order_idx" ON "IntegrationOption"("questionId", "order");

ALTER TABLE "IntegrationOption"
  ADD CONSTRAINT "IntegrationOption_questionId_fkey"
  FOREIGN KEY ("questionId") REFERENCES "IntegrationQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "IntegrationAttempt" (
    "id" TEXT NOT NULL,
    "guestId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "correctCount" INTEGER NOT NULL,
    "totalCount" INTEGER NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrationAttempt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "IntegrationAttempt_guestId_assetId_idx" ON "IntegrationAttempt"("guestId", "assetId");
CREATE INDEX "IntegrationAttempt_assetId_idx" ON "IntegrationAttempt"("assetId");

ALTER TABLE "IntegrationAttempt"
  ADD CONSTRAINT "IntegrationAttempt_guestId_fkey"
  FOREIGN KEY ("guestId") REFERENCES "IntegrationGuest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "IntegrationAttempt"
  ADD CONSTRAINT "IntegrationAttempt_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "IntegrationAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "IntegrationAnswer" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,

    CONSTRAINT "IntegrationAnswer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IntegrationAnswer_attemptId_questionId_key" ON "IntegrationAnswer"("attemptId", "questionId");
CREATE INDEX "IntegrationAnswer_questionId_idx" ON "IntegrationAnswer"("questionId");

ALTER TABLE "IntegrationAnswer"
  ADD CONSTRAINT "IntegrationAnswer_attemptId_fkey"
  FOREIGN KEY ("attemptId") REFERENCES "IntegrationAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "IntegrationAnswer"
  ADD CONSTRAINT "IntegrationAnswer_questionId_fkey"
  FOREIGN KEY ("questionId") REFERENCES "IntegrationQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "IntegrationAnswer"
  ADD CONSTRAINT "IntegrationAnswer_optionId_fkey"
  FOREIGN KEY ("optionId") REFERENCES "IntegrationOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── WhatsApp passa a aceitar convidado como destinatário ──────────────────
--
-- `userId` vira anulável e ganha um irmão. O número continua NÃO sendo
-- copiado para cá: ele é resolvido na hora do envio, do cadastro do
-- colaborador ou do convite — esta tabela não vira lista de contatos.

ALTER TABLE "WhatsappMessage" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "WhatsappMessage" ADD COLUMN "guestId" TEXT;

CREATE INDEX "WhatsappMessage_guestId_idx" ON "WhatsappMessage"("guestId");

ALTER TABLE "WhatsappMessage"
  ADD CONSTRAINT "WhatsappMessage_guestId_fkey"
  FOREIGN KEY ("guestId") REFERENCES "IntegrationGuest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
