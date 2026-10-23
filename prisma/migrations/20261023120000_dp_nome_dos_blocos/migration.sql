-- Departamento Pessoal: os blocos de pastas passam a ser renomeáveis.
--
-- O nome de fábrica de cada bloco é constante em `lib/personnel-catalog`.
-- Esta tabela guarda SÓ o que foi renomeado — sem linha, vale a constante.
-- Popular os quatro blocos na migration criaria duas verdades sobre como cada
-- um se chama, e um bloco novo no catálogo nasceria sem nome.
--
-- Para desfazer (devolve todos os blocos aos nomes de fábrica):
--
--   DROP TABLE "PersonnelGroupName";

CREATE TABLE IF NOT EXISTS "PersonnelGroupName" (
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersonnelGroupName_pkey" PRIMARY KEY ("key")
);
