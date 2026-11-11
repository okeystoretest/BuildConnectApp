import { prisma } from "@/lib/db/prisma";

/**
 * O que entra na conta do progresso (Meu Progresso, Início, barra "Concluído"
 * do setor, Meu Setor, Histórico do Colaborador no DHO).
 *
 * Só os subsetores PADRAO. As vitrines (Coleção, Workshop) são visualização
 * casual — nenhum vídeo delas conta como material a concluir, em módulo
 * nenhum.
 */
export const TRACKED_SUBSECTOR = { kind: "PADRAO" } as const;

/**
 * Os subsetores cujo conteúdo ESTA pessoa precisa concluir.
 *
 * A régua, de 11/11/2026: o progresso é do SUBSETOR da pessoa, não do setor
 * inteiro. Quem está em Produção > Almoxarifado deve o material do
 * almoxarifado — contar a Produção toda faz essa pessoa dever costura, corte
 * e PCP, que não são dela.
 *
 *   marcado no cadastro  → só os marcados que são do setor dela
 *   nada marcado         → todos os subsetores rastreados do setor
 *
 * O recorte pelo setor da pessoa não é redundante: um vínculo de subsetor pode
 * atravessar setores, e sem ele quem tem uma marcação fora da própria lotação
 * carregaria o acervo daquele outro setor como pendência sua.
 *
 * Marcação que só aponta para vitrine devolve lista vazia, e não o setor
 * inteiro: a pessoa marcada apenas numa vitrine não tem material a concluir, e
 * cair no setor todo seria dar a ela o oposto do que a marcação diz.
 *
 * Pura de propósito: a lista de candidatos vem do banco, a decisão é testada
 * sem ele — e o painel do setor resolve N colaboradores sem N consultas.
 */
export function trackedSubsectorIdsOf(
  markedSubsectorIds: readonly string[],
  sectorTrackedIds: readonly string[],
): string[] {
  if (markedSubsectorIds.length === 0) return [...sectorTrackedIds];
  const doSetor = new Set(sectorTrackedIds);
  return markedSubsectorIds.filter((id) => doSetor.has(id));
}

/**
 * O mesmo recorte, já como filtro de subsetor do Prisma, para quem resolve UMA
 * pessoa de cada vez.
 *
 * `{ id: { in: [] } }` quando a pessoa não tem lotação: sem setor não há
 * material, e devolver filtro vazio faria ela herdar o acervo da empresa.
 */
export async function trackedSubsectorFilterOf(
  userId: string,
): Promise<{ id: { in: string[] } }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { sectorId: true, subsectors: { select: { subsectorId: true } } },
  });
  if (!user?.sectorId) return { id: { in: [] } };

  const doSetor = await prisma.subsector.findMany({
    where: { ...TRACKED_SUBSECTOR, sectorId: user.sectorId },
    select: { id: true },
  });

  return {
    id: {
      in: trackedSubsectorIdsOf(
        user.subsectors.map((s) => s.subsectorId),
        doSetor.map((s) => s.id),
      ),
    },
  };
}
