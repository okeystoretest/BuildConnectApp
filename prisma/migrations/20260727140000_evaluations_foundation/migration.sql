-- Fundação de Avaliações: instrumentos, formulário paginado, submissões,
-- respostas, ciclo do Pré-Efetivo e tabela de feriados. Adiciona também o
-- tipo de notificação AVALIACAO.
--
-- Observação: EvaluationType e Evaluation já existiam com estrutura mínima.
-- Aqui estendemos EvaluationType (novas colunas com default) e reescrevemos
-- Evaluation adicionando colunas — sem perda de dados pois o projeto ainda
-- não está em produção.

-- ─── Enums ───────────────────────────────────────────────────
CREATE TYPE "EvaluationKind" AS ENUM ('PRE_EFETIVO', 'COMPORTAMENTAL', 'MATRIZ_DECISAO', 'EFICACIA', 'INTELIGENCIA_EMOCIONAL');
CREATE TYPE "EvaluationStatus" AS ENUM ('RASCUNHO', 'CONCLUIDA');
CREATE TYPE "EvaluationCycleStatus" AS ENUM ('AGENDADO', 'DISPONIVEL', 'CONCLUIDO');

-- (AVALIACAO em NotificationKind foi adicionado na migração anterior,
--  isolada, pois ALTER TYPE ADD VALUE exige commit próprio.)

-- ─── EvaluationType: novas colunas ───────────────────────────
ALTER TABLE "EvaluationType"
  ADD COLUMN "kind" "EvaluationKind" NOT NULL DEFAULT 'COMPORTAMENTAL',
  ADD COLUMN "description" TEXT,
  ADD COLUMN "scaleMax" INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN "hasCycle" BOOLEAN NOT NULL DEFAULT false;

-- ─── EvaluationSection ───────────────────────────────────────
CREATE TABLE "EvaluationSection" (
  "id" TEXT NOT NULL,
  "typeId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "order" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "EvaluationSection_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "EvaluationSection_typeId_order_idx" ON "EvaluationSection"("typeId", "order");

-- ─── EvaluationQuestion ──────────────────────────────────────
CREATE TABLE "EvaluationQuestion" (
  "id" TEXT NOT NULL,
  "sectionId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "helpText" TEXT,
  "order" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "EvaluationQuestion_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "EvaluationQuestion_sectionId_order_idx" ON "EvaluationQuestion"("sectionId", "order");

-- ─── Evaluation: novas colunas ───────────────────────────────
ALTER TABLE "Evaluation"
  ADD COLUMN "evaluatorId" TEXT,
  ADD COLUMN "cycle" INTEGER,
  ADD COLUMN "status" "EvaluationStatus" NOT NULL DEFAULT 'CONCLUIDA',
  ADD COLUMN "total" INTEGER,
  ADD COLUMN "observations" TEXT;

-- Colunas legadas `score`/`notes` permanecem (nullable) para não quebrar
-- registros existentes; a aplicação passa a usar `total`/`observations`.

-- Remove colunas legadas de Evaluation (substituídas por total/observations).
-- Projeto ainda não está em produção — sem dado a preservar.
ALTER TABLE "Evaluation" DROP COLUMN IF EXISTS "score";
ALTER TABLE "Evaluation" DROP COLUMN IF EXISTS "notes";

CREATE INDEX "Evaluation_evaluatorId_idx" ON "Evaluation"("evaluatorId");

-- ─── EvaluationAnswer ────────────────────────────────────────
CREATE TABLE "EvaluationAnswer" (
  "id" TEXT NOT NULL,
  "evaluationId" TEXT NOT NULL,
  "questionId" TEXT NOT NULL,
  "value" INTEGER NOT NULL,
  CONSTRAINT "EvaluationAnswer_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EvaluationAnswer_evaluationId_questionId_key" ON "EvaluationAnswer"("evaluationId", "questionId");
CREATE INDEX "EvaluationAnswer_questionId_idx" ON "EvaluationAnswer"("questionId");

-- ─── EvaluationCycle ─────────────────────────────────────────
CREATE TABLE "EvaluationCycle" (
  "id" TEXT NOT NULL,
  "typeId" TEXT NOT NULL,
  "subjectId" TEXT NOT NULL,
  "cycle" INTEGER NOT NULL,
  "status" "EvaluationCycleStatus" NOT NULL DEFAULT 'AGENDADO',
  "availableAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),
  "notifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EvaluationCycle_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EvaluationCycle_subjectId_typeId_cycle_key" ON "EvaluationCycle"("subjectId", "typeId", "cycle");
CREATE INDEX "EvaluationCycle_status_availableAt_idx" ON "EvaluationCycle"("status", "availableAt");
CREATE INDEX "EvaluationCycle_subjectId_idx" ON "EvaluationCycle"("subjectId");

-- ─── Holiday ─────────────────────────────────────────────────
CREATE TABLE "Holiday" (
  "id" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "label" TEXT NOT NULL,
  CONSTRAINT "Holiday_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Holiday_date_key" ON "Holiday"("date");
CREATE INDEX "Holiday_date_idx" ON "Holiday"("date");

-- ─── Foreign keys ────────────────────────────────────────────
ALTER TABLE "EvaluationSection"
  ADD CONSTRAINT "EvaluationSection_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "EvaluationType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EvaluationQuestion"
  ADD CONSTRAINT "EvaluationQuestion_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "EvaluationSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Evaluation"
  ADD CONSTRAINT "Evaluation_evaluatorId_fkey" FOREIGN KEY ("evaluatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EvaluationAnswer"
  ADD CONSTRAINT "EvaluationAnswer_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "Evaluation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EvaluationAnswer"
  ADD CONSTRAINT "EvaluationAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "EvaluationQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EvaluationCycle"
  ADD CONSTRAINT "EvaluationCycle_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "EvaluationType"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EvaluationCycle"
  ADD CONSTRAINT "EvaluationCycle_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
