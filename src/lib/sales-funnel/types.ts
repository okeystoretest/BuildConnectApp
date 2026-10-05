/**
 * Domínio do Funil de Vendas (planejamento comercial).
 *
 * NÃO confundir com `src/lib/funnel.ts`, que classifica CONTEÚDO em
 * TOFU/MOFU/BOFU. Aqui se mede volume comercial: quantas oportunidades
 * precisam entrar para que a meta de faturamento seja batida.
 *
 * Dinheiro trafega como CENTAVOS INTEIROS. Float não guarda dinheiro: uma
 * meta de R$ 50.000,00 vira 49999.99999999999 e o erro entra direto na
 * divisão que define as conversões.
 */

export type DiagnosticCode =
  | "META_INVALIDA"
  | "TICKET_INVALIDO"
  | "SEM_ETAPAS"
  | "TAXA_INVALIDA"
  | "VOLUME_IRREAL"
  | "EQUIPE_AUSENTE"
  | "CANAIS_INSUFICIENTES"
  | "FATIA_INVALIDA"
  | "COBERTURA_INCOMPLETA"
  | "COBERTURA_EXCEDIDA";

/**
 * "erro" impede o cálculo — a tela diz o que falta preencher.
 * "aviso" calcula assim mesmo e mostra o alerta ao lado do número.
 */
export type DiagnosticSeverity = "erro" | "aviso";

export interface Diagnostic {
  code: DiagnosticCode;
  severity: DiagnosticSeverity;
  /** Id da etapa ou do canal a que o diagnóstico se refere, quando há um. */
  targetId?: string;
  /** Texto pronto para a tela. O componente não monta frase. */
  message: string;
}

export interface StageInput {
  id: string;
  label: string;
  /** Taxa DESTA etapa para a seguinte, em %. A última converte em negócio ganho. */
  rate: number;
}

export interface ChannelInput {
  id: string;
  label: string;
  /** Fatia do topo do funil que este canal responde, em %. */
  share: number;
}

export interface FunnelInput {
  goalCents: number;
  ticketCents: number;
  stages: readonly StageInput[];
  channels: readonly ChannelInput[];
}

/**
 * Quem executa o funil e em quanto tempo — o que transforma volume do período
 * em atividade cobrável do vendedor.
 *
 * Fica FORA de `FunnelInput` de propósito: o funil inteiro se calcula sem
 * equipe declarada, e é isso que mantém os funis salvos antes de 30/09/2026
 * desenhando. Sem equipe não há plano de ação — não há erro.
 */
export interface Equipe {
  vendedores: number;
  diasUteis: number;
}

export interface StageVolume {
  id: string;
  label: string;
  rate: number;
  /** Quantas oportunidades precisam ENTRAR nesta etapa. */
  volume: number;
}

export interface ChannelVolume {
  id: string;
  label: string;
  share: number;
  /** Fatia traduzida em número absoluto de prospecções. */
  volume: number;
}

export interface FunnelResult {
  requiredConversions: number;
  stages: readonly StageVolume[];
  /** Volume da primeira etapa: a boca do funil. */
  topVolume: number;
  /** requiredConversions / topVolume, em %. Zero quando não há cálculo. */
  externalRate: number;
  projectedRevenueCents: number;
  channels: readonly ChannelVolume[];
  /** Soma das fatias dos canais, em %. */
  channelCoverage: number;
  diagnostics: readonly Diagnostic[];
}

/**
 * As três alavancas do bloco 5 do canvas. O cenário guarda só o que MUDA:
 * onde não há entrada em `rates`, a etapa herda a taxa do plano — assim um
 * cenário não congela por acidente uma etapa que o plano corrigiu depois.
 */
export interface ScenarioInput {
  id: string;
  name: string;
  /** "Melhore o ticket médio": +10 = ticket 10% maior. */
  ticketPercent: number;
  /**
   * "Aumente a boca do funil", em atividade diária cobrável: 6 = cada vendedor
   * abre 6 oportunidades por dia útil, e o topo do cenário é 6 × dias ×
   * vendedores.
   *
   * Ausente = o cenário herda o topo do plano. Substituiu o `topPercent`, que
   * nasceu inerte: como percentual, os 528 do canvas seriam "+18,65%", número
   * que ninguém digita nem confere de cabeça. Exige equipe declarada, e sem
   * ela o cenário devolve EQUIPE_AUSENTE.
   */
  opportunitiesPerSellerDay?: number;
  /** "Melhore as taxas internas": stageId → taxa que substitui a do plano. */
  rates: ReadonlyMap<string, number>;
}

export interface ScenarioComparison {
  plano: FunnelResult;
  cenario: FunnelResult;
  /** Negócios que o cenário fecha além dos que a meta exigia. */
  deltaConversions: number;
  /**
   * Faturamento do cenário menos a META, que é o "ganho" do canvas.
   *
   * Contra a meta, e não contra o faturamento do plano, porque o faturamento
   * do plano é ele mesmo artefato do arredondamento — comparar com ele daria
   * R$ 17.125,20 onde a metodologia pede R$ 17.047,95. `null` quando o cenário
   * tem erro: não há ganho de um cálculo que não existe.
   */
  ganhoCents: number | null;
}
