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
 * As linhas de etapa prontas para o banco, com a `order` reatribuída a partir
 * da POSIÇÃO no array — nunca vinda do cliente. É isso que impede buraco
 * (0,1,3) e empate (0,1,1).
 *
 * Mora numa função só porque dois caminhos gravam etapa — a substituição
 * isolada e o salvamento inteiro — e duas cópias da reatribuição divergiriam
 * na primeira vez que uma delas mudasse.
 */
function linhasDeEtapa(funnelId: string, stages: readonly EtapaParaGravar[]) {
  return stages.map((stage, order) => ({
    funnelId,
    order,
    label: stage.label,
    conversionRate: stage.rate,
    transitionRule: stage.transitionRule || null,
  }));
}

/** O mesmo para canais, pelo mesmo motivo. */
function linhasDeCanal(funnelId: string, channels: readonly CanalParaGravar[]) {
  return channels.map((canal, order) => ({
    funnelId,
    order,
    label: canal.label,
    strategy: canal.strategy || null,
    share: canal.share,
  }));
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
    prisma.salesFunnelStage.createMany({ data: linhasDeEtapa(funnelId, stages) }),
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
    prisma.salesFunnelChannel.createMany({ data: linhasDeCanal(funnelId, channels) }),
  ]);
}

/** Os campos escalares do funil, já convertidos para o formato do banco. */
export interface FunilParaGravar {
  name: string;
  referenceDate: Date;
  /** Decimal do Postgres: string com duas casas, nunca float. */
  goalAmount: string;
  averageTicket: string;
  sellerCount: number | null;
  workingDays: number | null;
  notes: string | null;
}

/**
 * Salva o funil inteiro — dados, etapas e canais — numa transação só.
 *
 * Até 05/10/2026 a tela fazia isto em TRÊS escritas independentes, e a do
 * meio é destrutiva: `substituirEtapas` apaga as etapas e, pela cascata,
 * leva junto as taxas de todos os cenários. Uma falha depois dela deixava o
 * funil com meta nova, etapas recriadas e canais velhos — e as taxas de
 * cenário destruídas por um salvamento que nunca completou. Agora ou tudo
 * entra, ou nada entra.
 *
 * Devolve `false` quando o funil não é deste subsetor. A checagem de escopo é
 * o PRIMEIRO comando, antes de qualquer escrita, então um `false` nunca
 * deixou rastro para desfazer.
 */
export async function salvarFunilInteiro(
  funnelId: string,
  subsectorId: string,
  dados: FunilParaGravar,
  stages: readonly EtapaParaGravar[],
  channels: readonly CanalParaGravar[],
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const alterados = await tx.salesFunnel.updateMany({
      where: { id: funnelId, subsectorId },
      data: dados,
    });
    if (alterados.count === 0) return false;

    await tx.salesFunnelStage.deleteMany({ where: { funnelId } });
    await tx.salesFunnelStage.createMany({ data: linhasDeEtapa(funnelId, stages) });

    await tx.salesFunnelChannel.deleteMany({ where: { funnelId } });
    await tx.salesFunnelChannel.createMany({ data: linhasDeCanal(funnelId, channels) });

    return true;
  });
}

export interface CenarioParaGravar {
  /** Ausente = criar. Presente = substituir o cenário existente. */
  scenarioId?: string;
  funnelId: string;
  name: string;
  notes?: string;
  ticketPercent: number;
  /** Ausente = o cenário herda o topo do plano. */
  opportunitiesPerSellerDay: number | null;
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
  return prisma.$transaction(async (tx) => {
    // A leitura fica DENTRO da transação. Fora dela, um salvamento de etapas
    // concorrente — que apaga e recria a lista inteira — podia acontecer
    // entre o `findMany` e o `createMany`, e aí a inserção batia na chave
    // estrangeira de `stageId` e derrubava o salvamento com um erro de banco
    // cru, em vez da taxa ser simplesmente descartada como manda a regra.
    const etapas = await tx.salesFunnelStage.findMany({
      where: { funnelId: dados.funnelId },
      select: { id: true },
    });
    const validos = new Set(etapas.map((e) => e.id));
    const rates = dados.rates.filter((r) => validos.has(r.stageId));

    let id = dados.scenarioId;
    if (id) {
      const alterados = await tx.salesFunnelScenario.updateMany({
        where: { id, funnelId: dados.funnelId },
        data: {
          name: dados.name,
          notes: dados.notes || null,
          ticketPercent: dados.ticketPercent,
          opportunitiesPerSellerDay: dados.opportunitiesPerSellerDay,
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
          opportunitiesPerSellerDay: dados.opportunitiesPerSellerDay,
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
