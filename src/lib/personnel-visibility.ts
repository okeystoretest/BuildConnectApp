import type { PersonnelFolderGroup } from "@/types/hr";
import type { Role } from "@/types";

/**
 * O que cada visitante vê da documentação pessoal — as regras puras.
 *
 * Sem Prisma e sem React neste módulo, como em `personnel-expiry`: é o que o
 * teste unitário prova, e é o que permite que ele exista. Quem decide ACESSO
 * consultando o banco é `auth/access` (`canReadPersonnelOf`); aqui ficam as
 * duas regras que não dependem de consulta nenhuma.
 *
 * Elas não moram nas actions de propósito: `user-actions` e
 * `personnel-actions` são `"use server"`, onde todo export vira endpoint —
 * função pura não cabe lá e, sem export, não teria como ser provada.
 */

/**
 * A permissão de ver documentos do setor só existe para GESTOR.
 *
 * Zerar no rebaixamento é o ponto: sem isto a permissão ficaria dormente no
 * cadastro de quem virou Colaborador, pronta para reviver na próxima promoção
 * sem ninguém ter decidido de novo. O ADMIN alcança por outro caminho
 * (`canAdministerDho`) — a coluna não é dele.
 */
export function sectorDocsFlag(role: Role, marked: boolean): boolean {
  return role === "GESTOR" && marked;
}

/**
 * As mesmas pastas, sem o caminho dos arquivos.
 *
 * Para quem só VISUALIZA, o caminho seria inútil — `/uploads/pessoal` recusa
 * quem não é do DHO —, mas mandá-lo assim mesmo entregaria a estrutura do
 * acervo a quem só pode ver a página renderizada. O visualizador abre pelo ID
 * do arquivo, então nada na tela sente falta.
 *
 * Devolve cópia: o acervo do DHO, lido na mesma requisição, não pode perder o
 * caminho junto.
 */
export function withoutFilePaths(
  groups: readonly PersonnelFolderGroup[],
): PersonnelFolderGroup[] {
  return groups.map((group) => ({
    ...group,
    folders: group.folders.map((folder) => ({
      ...folder,
      files: folder.files.map((file) => ({ ...file, filePath: "" })),
    })),
  }));
}
