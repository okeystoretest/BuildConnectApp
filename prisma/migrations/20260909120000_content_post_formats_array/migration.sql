-- Formato do post vira LISTA.
--
-- A mesma peça costuma sair em mais de um formato (um Reel que também vira
-- Story, um Carrossel que vira Feed). Com uma coluna única, registrar isso
-- exigia duplicar o post — e o post duplicado contava duas vezes no volume do
-- funil e no backlog.
--
-- A ordem das três instruções é o que preserva os dados: a coluna nova nasce
-- vazia, o UPDATE copia o valor antigo para dentro do array, e só então a
-- coluna antiga cai. Invertendo, todo post existente perderia o formato.

ALTER TABLE "ContentPost"
  ADD COLUMN "formats" "ContentFormat"[] DEFAULT ARRAY[]::"ContentFormat"[];

UPDATE "ContentPost" SET "formats" = ARRAY["format"];

ALTER TABLE "ContentPost" DROP COLUMN "format";
