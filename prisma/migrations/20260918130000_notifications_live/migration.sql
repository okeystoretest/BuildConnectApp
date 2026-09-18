-- Sino ligado ao banco. As linhas antigas nunca foram exibidas (o sino não lia
-- daqui) e guardam audiência por rótulo, que deixou de valer: só o pós-deploy
-- conta.
DELETE FROM "Notification";

ALTER TYPE "NotificationKind" ADD VALUE 'FORMULARIO';
ALTER TYPE "WhatsappKind" ADD VALUE 'CHAMADO_TI';

-- "Limpar notificações": some da lista deste usuário, persistido.
ALTER TABLE "NotificationRead" ADD COLUMN "dismissed" BOOLEAN NOT NULL DEFAULT false;

-- Texto próprio da mensagem (código do chamado); nulo = texto padrão do tipo.
ALTER TABLE "WhatsappMessage" ADD COLUMN "text" TEXT;
