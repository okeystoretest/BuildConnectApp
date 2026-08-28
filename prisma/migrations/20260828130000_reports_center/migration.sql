-- Central de Denúncias.
--
-- Canal anônimo aberto na tela de login: NÃO há coluna de autor, de sessão ou
-- de IP — exigir qualquer uma delas identificaria quem denuncia.
--
-- O registro é imutável por decisão de produto: a aplicação não expõe nenhuma
-- via de exclusão. O ciclo é ABERTA → EM_ANALISE → ENCERRADA; `closedAt` marca
-- o encerramento e inicia a janela de 30 minutos antes do arquivamento.

CREATE TYPE "ReportStatus" AS ENUM ('ABERTA', 'EM_ANALISE', 'ENCERRADA');

CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'ABERTA',
    "targetUserId" TEXT,
    "targetName" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "handlingNote" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReportAttachment" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportAttachment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Report_code_key" ON "Report"("code");
CREATE INDEX "Report_status_createdAt_idx" ON "Report"("status", "createdAt");
CREATE INDEX "Report_targetUserId_idx" ON "Report"("targetUserId");
CREATE INDEX "ReportAttachment_reportId_order_idx" ON "ReportAttachment"("reportId", "order");

-- Desligar alguém do sistema nunca pode apagar uma denúncia: o vínculo vira
-- nulo e o nome permanece congelado em "targetName".
ALTER TABLE "Report"
  ADD CONSTRAINT "Report_targetUserId_fkey"
  FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ReportAttachment"
  ADD CONSTRAINT "ReportAttachment_reportId_fkey"
  FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;
