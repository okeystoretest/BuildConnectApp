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

/**
 * Substitui a lista de canais inteira. Mesma receita das etapas, pelo mesmo
 * motivo: `@@unique([funnelId, order])` não pode ver estado intermediário, e
 * a `order` vem da POSIÇÃO no array, nunca do cliente.
 *
 * Canal não tem dependente — nenhum cenário aponta para canal —, então aqui
 * não há cascata a considerar.
 */
export async function substituirCanais(
  funnelId: string,
  channels: readonly CanalParaGravar[],
): Promise<void> {
  await prisma.$transaction([
    prisma.salesFunnelChannel.deleteMany({ where: { funnelId } }),
    prisma.salesFunnelChannel.createMany({
      data: channels.map((canal, order) => ({
        funnelId,
        order,
        label: canal.label,
        strategy: canal.strategy || null,
        share: canal.share,
      })),
    }),
  ]);
}

export interface CenarioParaGravar {
  /** Ausente = criar. Presente = substituir o cenário existente. */
  scenarioId?: string;
  funnelId: string;
  name: string;
  notes?: string;
  ticketPercent: number;
  topPercent: number;
  rates: readonly { stageId: string; rate: number }[];
  createdById?: string;
}

/**
 * Cria ou substitui um cenário, com suas taxas.
 *
 * Só entra taxa que aponte para etapa DESTE funil: um `stageId` de outro
 * funil criaria uma linha sem significado, que o cálculo depois ignoraria em
 * silêncio. Descartar aqui é o que mantém "o que está no banco" igual a "o
 * que a tela mostra".
 *
 * Devolve o id do CENÁRIO — é o que a tela precisa para selecioná-lo — ou
 * null quando o cenário pedido não é deste funil.
 */
export async function gravarCenario(dados: CenarioParaGravar): Promise<string | null> {
  const etapas = await prisma.salesFunnelStage.findMany({
    where: { funnelId: dados.funnelId },
    select: { id: true },
  });
  const validos = new Set(etapas.map((e) => e.id));
  const rates = dados.rates.filter((r) => validos.has(r.stageId));

  return prisma.$transaction(async (tx) => {
    let id = dados.scenarioId;
    if (id) {
      const alterados = await tx.salesFunnelScenario.updateMany({
        where: { id, funnelId: dados.funnelId },
        data: {
          name: dados.name,
          notes: dados.notes || null,
          ticketPercent: dados.ticketPercent,
          topPercent: dados.topPercent,
        },
      });
      if (alterados.count === 0) return null;
      await tx.salesFunnelScenarioRate.deleteMany({ where: { scenarioId: id } });
    } else {
      const criado = await tx.salesFunnelScenario.create({
        data: {
          funnelId: dados.funnelId,
          name: dados.name,
          notes: dados.notes || null,
          ticketPercent: dados.ticketPercent,
          topPercent: dados.topPercent,
          createdById: dados.createdById ?? null,
        },
        select: { id: true },
      });
      id = criado.id;
    }

    if (rates.length > 0) {
      const scenarioId = id;
      await tx.salesFunnelScenarioRate.createMany({
        data: rates.map((r) => ({ scenarioId, stageId: r.stageId, conversionRate: r.rate })),
      });
    }
    return id;
  });
}
