-- Rodadas de formulário.
--
-- Reabrir um formulário encerrado passa a recomeçar a coleta: todas as
-- atribuições voltam a PENDENTE e todo mundo responde de novo. As respostas
-- anteriores NÃO são apagadas — ficam marcadas com a rodada em que foram
-- dadas, e o dashboard passa a poder consultá-las por rodada.
--
-- Sem esta coluna, reabrir misturaria as respostas das duas coletas na mesma
-- média, o que é pior do que não reabrir: o número existiria e estaria errado.
--
-- Aditiva de propósito. Os dois DEFAULT fazem toda linha existente virar
-- rodada 1 sozinha, sem script de conversão e sem janela em que a coluna
-- esteja nula.

-- AlterTable
ALTER TABLE "Form" ADD COLUMN     "currentRound" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "FormResponse" ADD COLUMN     "round" INTEGER NOT NULL DEFAULT 1;

-- CreateIndex
CREATE INDEX "FormResponse_formId_round_idx" ON "FormResponse"("formId", "round");
