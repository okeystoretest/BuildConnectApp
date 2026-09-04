-- Notificações por WhatsApp: sessão do Baileys e fila/auditoria de envios.
--
-- A sessão fica no BANCO, e não em arquivo, porque o único disco persistente
-- do deploy é o volume de /uploads — e a rota app/uploads/[...path] serve
-- qualquer arquivo de lá para quem tem sessão. A credencial do WhatsApp
-- ficaria baixável por qualquer colaborador logado. Aqui, nenhuma rota a
-- alcança. De quebra, trocar de número vira apagar linhas por um botão.
--
-- WhatsappMessage é fila e log ao mesmo tempo, e NÃO guarda telefone: o número
-- é resolvido do User na hora do envio. Assim a auditoria responde "fulano
-- recebeu?" sem que a tabela vire uma lista de contatos.
--
-- Totalmente aditiva: nenhuma tabela existente é alterada.

-- CreateEnum
CREATE TYPE "WhatsappKind" AS ENUM ('AVALIACAO', 'FORMULARIO');

-- CreateEnum
CREATE TYPE "WhatsappStatus" AS ENUM ('PENDENTE', 'ENVIADO', 'FALHOU');

-- CreateTable
CREATE TABLE "WhatsappSession" (
    "id" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsappSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsappMessage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "WhatsappKind" NOT NULL,
    "status" "WhatsappStatus" NOT NULL DEFAULT 'PENDENTE',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "WhatsappMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WhatsappMessage_status_createdAt_idx" ON "WhatsappMessage"("status", "createdAt");

-- CreateIndex
CREATE INDEX "WhatsappMessage_userId_idx" ON "WhatsappMessage"("userId");

-- AddForeignKey
ALTER TABLE "WhatsappMessage" ADD CONSTRAINT "WhatsappMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
