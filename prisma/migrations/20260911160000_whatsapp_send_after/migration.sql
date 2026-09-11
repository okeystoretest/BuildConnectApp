-- O intervalo entre envios (aleatório, de 1 s a 7200 s) passa a ser um horário
-- gravado por mensagem, em vez de uma espera dentro da requisição. O que já
-- está na fila recebe "agora" e sai na próxima passada.
ALTER TABLE "WhatsappMessage" ADD COLUMN "sendAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

DROP INDEX "WhatsappMessage_status_createdAt_idx";
CREATE INDEX "WhatsappMessage_status_sendAfter_idx" ON "WhatsappMessage"("status", "sendAfter");
