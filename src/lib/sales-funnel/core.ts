import { prisma } from "@/lib/db/prisma";

/**
 * Operações de banco do Funil de Vendas, sem sessão e sem validação.
 *
 * Existem separadas das actions porque a action começa lendo o cookie, e o
 * que precisa ser demonstrado contra o Postgres — que a lista é substituída
 * inteira, sem ordem duplicada e sem buraco — não tem nada a ver com quem
 * está pedindo. Autorização fica em `guards.ts`, forma do dado em `actions.ts`,
 * e o efeito no banco aqui.
 *
 * Nada aqui confere permissão. Quem chama já conferiu.
 */

export interface EtapaParaGravar {
  label: string;
  rate: number;
  transitionRule?: string;
}

export interface CanalParaGravar {
  label: string;
  strategy?: string;
  share: number;
}

/**
 * Substitui a lista de etapas inteira, em transação.
 *
 * Apagar e recriar dentro de um `$transaction` é o que garante que
 * `@@unique([funnelId, order])` nunca veja um estado intermediário com ordem
 * duplicada — e que um erro no meio não deixe o funil com metade das etapas.
 *
 * A `order` é sempre reatribuída a partir da POSIÇÃO no array, nunca vinda do
 * cliente: é isso que impede buraco (0,1,3) e empate (0,1,1).
 *
 * As etapas nascem com ids novos, então as taxas de cenário que apontavam
 * para as antigas somem pela cascata do banco. É deliberado: um cenário
 * apontando para etapa que deixou de existir é pior que uma taxa perdida.
 */
export async function substituirEtapas(
  funnelId: string,
  stages: readonly EtapaParaGravar[],
): Promise<void> {
  await prisma.$transaction([
    prisma.salesFunnelStage.deleteMany({ where: { funnelId } }),
    prisma.salesFunnelStage.createMany({
      data: stages.map((stage, order) => ({
        funnelId,
        order,
        label: stage.label,
        conversionRate: stage.rate,
        transitionRule: stage.transitionRule || null,
      })),
    }),
  ]);
}
