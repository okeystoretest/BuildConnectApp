-- Roteiros do Cronograma pela IA.
--
-- Duas tabelas novas e três colunas em ContentPost. Nada aqui reescreve linha
-- existente: todo card continua válido com roteiro nulo, e a plataforma sem
-- linha em AiSettings é a plataforma "sem IA" — o botão nem aparece.
--
-- AiSettings guarda a chave CIFRADA (ver lib/ai/secret.ts); apiKeyHint são só
-- os 4 últimos caracteres, para a tela confirmar qual chave está salva.

-- CreateTable
CREATE TABLE "AiSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "apiKeyCipher" TEXT,
    "apiKeyHint" TEXT,
    "model" TEXT NOT NULL DEFAULT 'gemini-2.5-flash',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "AiSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiInstruction" (
    "id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "AiInstruction_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "ContentPost"
    ADD COLUMN "script" TEXT,
    ADD COLUMN "scriptUpdatedAt" TIMESTAMP(3),
    ADD COLUMN "scriptById" TEXT;

-- CreateIndex
CREATE INDEX "ContentPost_scriptById_idx" ON "ContentPost"("scriptById");

-- AddForeignKey
ALTER TABLE "AiSettings" ADD CONSTRAINT "AiSettings_updatedById_fkey"
    FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiInstruction" ADD CONSTRAINT "AiInstruction_updatedById_fkey"
    FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentPost" ADD CONSTRAINT "ContentPost_scriptById_fkey"
    FOREIGN KEY ("scriptById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
