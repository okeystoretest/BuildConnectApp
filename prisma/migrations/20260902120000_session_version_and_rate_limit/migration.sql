-- Revogação imediata de sessão: o número vai assinado no cookie e é conferido
-- a cada requisição. Incrementar derruba as sessões abertas do usuário.
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "sessionVersion" INTEGER NOT NULL DEFAULT 0;

-- Contador de tentativas por janela (login e ações públicas da Central de
-- Denúncias). Em banco para sobreviver a restart/deploy.
-- CreateTable
CREATE TABLE "RateLimit" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "resetAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "RateLimit_resetAt_idx" ON "RateLimit"("resetAt");
