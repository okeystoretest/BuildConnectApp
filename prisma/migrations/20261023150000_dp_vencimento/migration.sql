-- Departamento Pessoal: pasta que vence.
--
-- Só pasta que VENCE tem linha. A maioria (RG, CTPS, dados bancários) não
-- vence, e as pastas do catálogo não têm linha nenhuma — são constante em
-- `lib/personnel-catalog`. Sem linha aqui, a pasta não vence.
--
-- DATE, e não TIMESTAMP: vencimento é dia de calendário. Hora zero em UTC
-- lida no fuso de Brasília cairia no dia anterior.
--
-- Para desfazer (nenhuma pasta volta a vencer):
--
--   DROP TABLE "PersonnelFolderExpiry";

CREATE TABLE IF NOT EXISTS "PersonnelFolderExpiry" (
    "ownerId" TEXT NOT NULL,
    "folder" TEXT NOT NULL,
    "expiresAt" DATE NOT NULL,
    -- O vencimento que o sino já avisou; nulo = a vencer sem aviso.
    "notifiedFor" DATE,

    CONSTRAINT "PersonnelFolderExpiry_pkey" PRIMARY KEY ("ownerId", "folder")
);

ALTER TABLE "PersonnelFolderExpiry"
  DROP CONSTRAINT IF EXISTS "PersonnelFolderExpiry_ownerId_fkey";

ALTER TABLE "PersonnelFolderExpiry"
  ADD CONSTRAINT "PersonnelFolderExpiry_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
