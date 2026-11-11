-- Página de Integração: módulo isolado para convidado sem conta.
--
-- Aditiva por inteiro. Nada do que já existe muda de forma: a única alteração
-- em tabela existente é uma coluna ANULÁVEL em "FormResponse", então toda
-- resposta já gravada continua válida sem script de conversão.
--
-- Para desfazer:
--
--   ALTER TABLE "FormResponse" DROP COLUMN "guestId";
--   DROP TABLE "IntegrationProgress";
--   DROP TABLE "IntegrationAsset";
--   DROP TABLE "IntegrationGuest";
--   DROP TABLE "IntegrationLink";
--   DROP TYPE "IntegrationAssetKind";

CREATE TYPE "IntegrationAssetKind" AS ENUM ('FILME', 'VIDEO', 'DOCUMENTO');

-- Link compartilhável. O token É a credencial de entrada; revogar não apaga
-- quem já entrou por ele.
CREATE TABLE "IntegrationLink" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrationLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IntegrationLink_token_key" ON "IntegrationLink"("token");
CREATE INDEX "IntegrationLink_revokedAt_idx" ON "IntegrationLink"("revokedAt");

ALTER TABLE "IntegrationLink"
  ADD CONSTRAINT "IntegrationLink_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- O convidado. Nome completo é a condição para navegar; não é usuário do
-- sistema e não tem sessão, papel nem setor.
CREATE TABLE "IntegrationGuest" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "linkId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrationGuest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "IntegrationGuest_linkId_idx" ON "IntegrationGuest"("linkId");

ALTER TABLE "IntegrationGuest"
  ADD CONSTRAINT "IntegrationGuest_linkId_fkey"
  FOREIGN KEY ("linkId") REFERENCES "IntegrationLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Peças da página: filmes da trilha, vídeos complementares e documentos.
CREATE TABLE "IntegrationAsset" (
    "id" TEXT NOT NULL,
    "kind" "IntegrationAssetKind" NOT NULL,
    "title" TEXT NOT NULL,
    "focus" TEXT,
    "lesson" TEXT,
    "filePath" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "formId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrationAsset_pkey" PRIMARY KEY ("id")
);

-- UNIQUE: um formulário é questionário de no máximo um filme. É esta
-- unicidade que a relação inversa em "Form" usa para sumir da lista do DHO.
CREATE UNIQUE INDEX "IntegrationAsset_formId_key" ON "IntegrationAsset"("formId");
CREATE INDEX "IntegrationAsset_kind_order_idx" ON "IntegrationAsset"("kind", "order");

-- SET NULL, e não CASCADE: apagar o formulário não pode levar o filme junto.
ALTER TABLE "IntegrationAsset"
  ADD CONSTRAINT "IntegrationAsset_formId_fkey"
  FOREIGN KEY ("formId") REFERENCES "Form"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Conclusão de um filme por um convidado: a única regra que destrava o próximo.
CREATE TABLE "IntegrationProgress" (
    "guestId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "concludedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrationProgress_pkey" PRIMARY KEY ("guestId", "assetId")
);

CREATE INDEX "IntegrationProgress_assetId_idx" ON "IntegrationProgress"("assetId");

ALTER TABLE "IntegrationProgress"
  ADD CONSTRAINT "IntegrationProgress_guestId_fkey"
  FOREIGN KEY ("guestId") REFERENCES "IntegrationGuest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "IntegrationProgress"
  ADD CONSTRAINT "IntegrationProgress_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "IntegrationAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A resposta do convidado entra no MESMO motor de formulários. Anulável: toda
-- resposta existente é de colaborador e segue com "guestId" nulo.
ALTER TABLE "FormResponse" ADD COLUMN "guestId" TEXT;

CREATE INDEX "FormResponse_guestId_idx" ON "FormResponse"("guestId");

ALTER TABLE "FormResponse"
  ADD CONSTRAINT "FormResponse_guestId_fkey"
  FOREIGN KEY ("guestId") REFERENCES "IntegrationGuest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
