-- Telefone do colaborador.
--
-- Obrigatório no cadastro, opcional na coluna. Não é contradição: os usuários
-- que já estão na base não têm número, e um NOT NULL sem default faria esta
-- migration falhar no boot — o entrypoint recusa subir o container quando isso
-- acontece. A exigência mora na validação de createUser/updateUser, que é onde
-- ela pode existir sem derrubar quem já está cadastrado.
--
-- Na prática: ninguém entra sem telefone daqui em diante, e os antigos vão
-- sendo preenchidos conforme forem editados. A lista do DHO marca quem falta.
--
-- Guarda só dígitos, sem máscara e sem código de país (ver src/lib/phone.ts).
-- Sem UNIQUE de propósito: linha compartilhada de setor existe.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "phone" TEXT;
