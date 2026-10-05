-- Plano de acao do Funil de Vendas: vendedores e dias uteis no funil, e a
-- alavanca "aumente a boca do funil" expressa em atividade diaria cobravel.
--
-- O DROP de "topPercent" foi conferido antes de ser escrito: a coluna nasceu
-- inerte (nenhum calculo a aplicava e a tela gravava 0 fixo) e a base nao
-- tinha nenhuma linha em SalesFunnelScenario.

-- AlterTable
ALTER TABLE "SalesFunnel" ADD COLUMN     "sellerCount" INTEGER,
ADD COLUMN     "workingDays" INTEGER;

-- AlterTable
ALTER TABLE "SalesFunnelScenario" DROP COLUMN "topPercent",
ADD COLUMN     "opportunitiesPerSellerDay" DOUBLE PRECISION;
