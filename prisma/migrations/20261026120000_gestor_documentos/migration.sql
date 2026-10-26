-- O Gestor alcança a documentação pessoal da própria equipe?
--
-- DEFAULT false, e é o ponto desta migration: quem já está cadastrado
-- continua SEM alcance. Nascer `true` abriria RG, CPF e dado bancário de toda
-- a empresa a todo gestor no instante do deploy, sem ninguém ter decidido.
--
-- Para desfazer:
--
--   ALTER TABLE "User" DROP COLUMN "canViewSectorDocs";

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "canViewSectorDocs" BOOLEAN NOT NULL DEFAULT false;
