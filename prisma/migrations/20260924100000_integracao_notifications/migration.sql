-- Chegada de um funcionário novo: o setor inteiro é avisado, no sino e no
-- WhatsApp. Tipo próprio nos dois enums, e não reaproveitamento de SISTEMA,
-- porque o sino pinta ícone e tom por tipo — integração é uma coisa, aviso
-- genérico é outra.
ALTER TYPE "NotificationKind" ADD VALUE 'INTEGRACAO';
ALTER TYPE "WhatsappKind" ADD VALUE 'INTEGRACAO';
