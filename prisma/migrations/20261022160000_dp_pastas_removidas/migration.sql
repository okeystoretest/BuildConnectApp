-- Departamento Pessoal: pastas do catálogo podem ser excluídas por colaborador.
--
-- O catálogo de pastas obrigatórias é constante em `lib/personnel-catalog`, e
-- não linha de banco. Sem registrar a remoção em algum lugar, excluir uma
-- dessas pastas não teria efeito nenhum: ela voltaria na renderização
-- seguinte, porque é a constante que gera a lista.
--
-- A coluna guarda o que SAIU, não o que ficou. Assim uma categoria nova no
-- catálogo nasce visível para todo mundo, sem precisar de migração de dados
-- para preencher a lista de cada colaborador já cadastrado.
--
-- Para desfazer (devolve todas as pastas do catálogo a todo mundo):
--
--   ALTER TABLE "User" DROP COLUMN "personnelRemovedFolders";

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "personnelRemovedFolders" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
