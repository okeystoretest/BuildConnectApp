import type { Role } from "@/types";

/**
 * Quem dá a nota a uma resposta de compreensão de Instrução em Vídeo.
 *
 * Regra: os Gestores do SETOR DO AUTOR (nunca o próprio autor). Quando não há
 * nenhum — autor sem setor, setor sem Gestor, ou o único Gestor é o próprio
 * autor — a resposta sobe para o Admin e para os Gestores lotados no DHO,
 * que já administram o setor inteiro no resto do sistema.
 *
 * Puro de propósito: a lista de candidatos vem do banco, a decisão é testada
 * sem ele. Quem avalia não fica gravado na resposta — é resolvido a cada
 * leitura, então trocar o Gestor de um setor redireciona as pendências.
 */

export interface GraderCandidate {
  id: string;
  role: Role;
  sectorId: string | null;
  /** Lotado no DHO (setor ou subsetor). */
  dho: boolean;
}

export interface ComprehensionAuthor {
  authorId: string;
  authorSectorId: string | null;
  /** Papel de quem respondeu. Resposta de Gestor sobe para a administração. */
  authorRole: Role;
}

export function resolveGraders(
  author: ComprehensionAuthor,
  candidates: readonly GraderCandidate[],
): GraderCandidate[] {
  const others = candidates.filter((c) => c.id !== author.authorId);

  // Resposta de GESTOR vai para TODOS os Admins, de qualquer setor — nunca
  // para um par do mesmo setor. Quem gere o setor não é avaliado por outro
  // gestor dele; a nota de quem manda vem de cima.
  //
  // Sem Admin cadastrado a regra cede para a de baixo, senão a resposta de um
  // Gestor ficaria sem ninguém para avaliá-la e esperaria para sempre.
  if (author.authorRole === "GESTOR") {
    const admins = others.filter((c) => c.role === "ADMIN");
    if (admins.length > 0) return admins;
  }

  if (author.authorSectorId) {
    const sectorManagers = others.filter(
      (c) => c.role === "GESTOR" && c.sectorId === author.authorSectorId,
    );
    if (sectorManagers.length > 0) return sectorManagers;
  }

  return others.filter((c) => c.role === "ADMIN" || (c.role === "GESTOR" && c.dho));
}

export function canGrade(
  grader: GraderCandidate,
  author: ComprehensionAuthor,
  candidates: readonly GraderCandidate[],
): boolean {
  return resolveGraders(author, candidates).some((g) => g.id === grader.id);
}
