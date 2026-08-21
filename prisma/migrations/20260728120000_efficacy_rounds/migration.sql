-- Avaliação multidirecional (Eficácia no Trabalho): rodadas, avaliadores
-- designados e notificação individual ao colaborador para a autoavaliação.

-- Enums
CREATE TYPE "EvaluationRoundStatus" AS ENUM ('COLETANDO_FEEDBACK', 'AGUARDANDO_AUTO', 'CONCLUIDA');
CREATE TYPE "EvaluationAssignmentStatus" AS ENUM ('PENDENTE', 'CONCLUIDA');

-- Notification: alvo individual opcional
ALTER TABLE "Notification" ADD COLUMN "targetUserId" TEXT;
ALTER TABLE "Notification"
  ADD CONSTRAINT "Notification_targetUserId_fkey"
  FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "Notification_targetUserId_idx" ON "Notification"("targetUserId");

-- EvaluationRound
CREATE TABLE "EvaluationRound" (
    "id" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "raterQuota" INTEGER NOT NULL DEFAULT 2,
    "status" "EvaluationRoundStatus" NOT NULL DEFAULT 'COLETANDO_FEEDBACK',
    "selfNotifiedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EvaluationRound_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "EvaluationRound_subjectId_idx" ON "EvaluationRound"("subjectId");
CREATE INDEX "EvaluationRound_status_idx" ON "EvaluationRound"("status");
ALTER TABLE "EvaluationRound"
  ADD CONSTRAINT "EvaluationRound_typeId_fkey"
  FOREIGN KEY ("typeId") REFERENCES "EvaluationType"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EvaluationRound"
  ADD CONSTRAINT "EvaluationRound_subjectId_fkey"
  FOREIGN KEY ("subjectId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- EvaluationAssignment
CREATE TABLE "EvaluationAssignment" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "raterId" TEXT NOT NULL,
    "status" "EvaluationAssignmentStatus" NOT NULL DEFAULT 'PENDENTE',
    "notifiedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EvaluationAssignment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EvaluationAssignment_roundId_raterId_key" ON "EvaluationAssignment"("roundId", "raterId");
CREATE INDEX "EvaluationAssignment_raterId_status_idx" ON "EvaluationAssignment"("raterId", "status");
ALTER TABLE "EvaluationAssignment"
  ADD CONSTRAINT "EvaluationAssignment_roundId_fkey"
  FOREIGN KEY ("roundId") REFERENCES "EvaluationRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EvaluationAssignment"
  ADD CONSTRAINT "EvaluationAssignment_raterId_fkey"
  FOREIGN KEY ("raterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Evaluation: vínculo com rodada + flag de autoavaliação
ALTER TABLE "Evaluation" ADD COLUMN "roundId" TEXT;
ALTER TABLE "Evaluation" ADD COLUMN "isSelfAssessment" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Evaluation"
  ADD CONSTRAINT "Evaluation_roundId_fkey"
  FOREIGN KEY ("roundId") REFERENCES "EvaluationRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "Evaluation_roundId_idx" ON "Evaluation"("roundId");
