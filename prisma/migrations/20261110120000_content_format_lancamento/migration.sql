-- Entra o formato "Lançamento" no vocabulário do Cronograma.
--
-- Migração ISOLADA, pelo mesmo motivo de 20260727135900_notification_kind_avaliacao:
-- `ALTER TYPE ... ADD VALUE` não convive com outras alterações na mesma
-- transação, e o novo valor não pode ser USADO na transação que o cria. A
-- coluna que o acompanha (ContentPost.lineUp) vem na migração seguinte.
--
-- `AFTER 'LIVE'` e não ao fim: "Outro" é o último do vocabulário por ser o
-- escape, e a ordem do enum é a que o FORMAT_ORDER espelha.
ALTER TYPE "ContentFormat" ADD VALUE IF NOT EXISTS 'LANCAMENTO' AFTER 'LIVE';
