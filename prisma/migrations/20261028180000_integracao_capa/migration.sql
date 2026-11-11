-- Capa do filme na Página de Integração.
--
-- Anulável: filme sem capa continua funcionando, a tela só desenha o bloco
-- sem imagem. Nada depende dela para tocar nem para liberar a trilha.
--
-- Para desfazer:
--
--   ALTER TABLE "IntegrationAsset" DROP COLUMN "thumbnailPath";

ALTER TABLE "IntegrationAsset" ADD COLUMN "thumbnailPath" TEXT;
