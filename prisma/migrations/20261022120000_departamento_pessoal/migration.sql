-- Departamento Pessoal (antiga aba "Documentos" do DHO).
--
-- A documentação pessoal do colaborador ganha tabela própria em vez de entrar
-- em "Document": aquela tabela é conteúdo de setor e alimenta progresso,
-- histórico e vitrine. Atestado médico e dado bancário não podem vazar para
-- lá por esquecimento de filtro.
--
-- "User.personnelFolders" guarda APENAS as pastas extra criadas à mão pelo
-- Gestor do DHO. As pastas obrigatórias do catálogo são constante em código
-- (lib/personnel-catalog) e as pastas por colaborador são derivadas da lista
-- de ativos — nada a popular aqui.
--
-- Para desfazer:
--
--   DROP TABLE "PersonnelFile";
--   ALTER TABLE "User" DROP COLUMN "personnelFolders";

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "personnelFolders" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE TABLE IF NOT EXISTS "PersonnelFile" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "FileKind" NOT NULL,
    "sizeBytes" INTEGER NOT NULL DEFAULT 0,
    "filePath" TEXT NOT NULL,
    "folder" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonnelFile_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PersonnelFile_ownerId_folder_idx" ON "PersonnelFile"("ownerId", "folder");

ALTER TABLE "PersonnelFile"
  ADD CONSTRAINT "PersonnelFile_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
