-- Nº do line-up do post de lançamento.
--
-- Nulo: só o formato LANCAMENTO pede o número, e todo post já existente é de
-- outro formato. INTEGER e não TEXT — é identificador numérico, e a validação
-- do formulário já recusa qualquer caractere que não seja dígito.
ALTER TABLE "ContentPost" ADD COLUMN "lineUp" INTEGER;
