import type {
  ChannelInput,
  ChannelVolume,
  Diagnostic,
  FunnelInput,
  FunnelResult,
  StageVolume,
} from "./types";

/**
 * Teto de sanidade do volume. Acima disto não é plano comercial, é erro de
 * digitação numa taxa — e um card com doze dígitos não informa nada.
 *
 * A comparação é `>=`, não `>`: o limite é inclusivo. Uma meta de R$ 100
 * milhões com taxa de 0,01% cai EXATAMENTE em 1.000.000.000, e um teto
 * exclusivo deixaria passar justamente o caso que motivou o teto.
 */
export const LIMITE_VOLUME = 1_000_000_000;

/** Resultado vazio: o que a tela mostra quando falta dado obrigatório. */
function vazio(diagnostics: Diagnostic[]): FunnelResult {
  return {
    requiredConversions: 0,
    stages: [],
    topVolume: 0,
    externalRate: 0,
    projectedRevenueCents: 0,
    channels: [],
    channelCoverage: 0,
    diagnostics,
  };
}

/**
 * Conversões necessárias para bater a meta — o bloco 1 do canvas.
 *
 * Arredonda para CIMA: meia venda não existe, e registrar 49 onde são
 * precisas 49,2 é registrar um plano que não bate a meta. Ticket maior que a
 * meta continua exigindo UMA conversão, nunca zero.
 */
export function conversoesNecessarias(goalCents: number, ticketCents: number): number {
  if (goalCents <= 0 || ticketCents <= 0) return 0;
  return Math.ceil(goalCents / ticketCents);
}

/**
 * Lê um valor monetário digitado por gente e devolve centavos.
 *
 * Aceita o formato brasileiro ("50.000,00"), o americano ("50000.00"), com ou
 * sem "R$", e o inteiro seco ("999" = R$ 999,00). Devolve null para o que não
 * é valor — a tela precisa distinguir "não preencheu" de "preencheu zero",
 * coisa que NaN convertido em 0 apagaria.
 */
export function parseMoedaParaCentavos(texto: string): number | null {
  const limpo = texto.replace(/[R$\s ]/g, "");
  if (limpo.length === 0) return null;
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+([.,]\d{1,2})?$/.test(limpo)) return null;

  // Separador decimal é o ÚLTIMO ponto ou vírgula seguido de 1 ou 2 dígitos.
  // "50.000" não casa (três dígitos), então continua valendo cinquenta mil.
  const decimal = /[.,]\d{1,2}$/.exec(limpo);
  const inteiroTexto = (decimal ? limpo.slice(0, decimal.index) : limpo).replace(/[.,]/g, "");
  const centavosTexto = decimal ? decimal[0].slice(1).padEnd(2, "0") : "00";

  const inteiro = Number(inteiroTexto === "" ? "0" : inteiroTexto);
  const centavos = Number(centavosTexto);
  if (!Number.isFinite(inteiro) || !Number.isFinite(centavos)) return null;
  return inteiro * 100 + centavos;
}

/** Confere meta, ticket, etapas e taxas. Lista vazia = pode calcular. */
function erros(input: FunnelInput): Diagnostic[] {
  const found: Diagnostic[] = [];
  if (input.goalCents <= 0) {
    found.push({ code: "META_INVALIDA", severity: "erro", message: "Informe a meta global." });
  }
  if (input.ticketCents <= 0) {
    found.push({ code: "TICKET_INVALIDO", severity: "erro", message: "Informe o ticket médio." });
  }
  if (input.stages.length === 0) {
    found.push({
      code: "SEM_ETAPAS",
      severity: "erro",
      message: "Defina ao menos uma etapa do funil.",
    });
  }
  for (const stage of input.stages) {
    if (!(stage.rate > 0 && stage.rate <= 100)) {
      found.push({
        code: "TAXA_INVALIDA",
        severity: "erro",
        targetId: stage.id,
        message: `A taxa de "${stage.label}" precisa ficar entre 0 e 100%.`,
      });
    }
  }
  return found;
}

/**
 * Meta → Prospecções. É a execução que o canvas manda: de baixo para cima,
 * DIVIDINDO por cada taxa até chegar à boca do funil.
 */
export function calcularAscendente(input: FunnelInput): FunnelResult {
  const problemas = erros(input);
  if (problemas.length > 0) return vazio(problemas);

  const conversoes = conversoesNecessarias(input.goalCents, input.ticketCents);

  // Percorre de trás para frente: o volume de uma etapa é o da seguinte
  // dividido pela taxa que as separa.
  const volumes: number[] = [];
  let abaixo = conversoes;
  for (const stage of [...input.stages].reverse()) {
    const volume = Math.ceil(abaixo / (stage.rate / 100));
    if (volume >= LIMITE_VOLUME) {
      return vazio([
        {
          code: "VOLUME_IRREAL",
          severity: "erro",
          targetId: stage.id,
          message:
            "As taxas informadas exigem um volume impossível. Confira se alguma taxa está muito baixa.",
        },
      ]);
    }
    volumes.push(volume);
    abaixo = volume;
  }
  volumes.reverse();

  const stages: StageVolume[] = input.stages.map((stage, i) => ({
    id: stage.id,
    label: stage.label,
    rate: stage.rate,
    volume: volumes[i] ?? 0,
  }));

  const topVolume = stages[0]?.volume ?? 0;

  return {
    requiredConversions: conversoes,
    stages,
    topVolume,
    externalRate: topVolume > 0 ? (conversoes / topVolume) * 100 : 0,
    projectedRevenueCents: conversoes * input.ticketCents,
    channels: [],
    channelCoverage: 0,
    diagnostics: [],
  };
}

/**
 * Capacidade → Faturamento. O outro lado da dica do canvas: de cima para
 * baixo, MULTIPLICANDO. A pessoa fixa quantas prospecções consegue fazer e
 * vê no que isso dá.
 *
 * Arredonda para BAIXO: 599 prospecções que rendem 29,8 vendas rendem 29.
 * Prometer a fração é prometer uma venda que não existe.
 */
export function calcularDescendente(input: FunnelInput, topVolume: number): FunnelResult {
  const problemas = erros(input);
  if (problemas.length > 0) return vazio(problemas);
  if (!(topVolume > 0) || topVolume >= LIMITE_VOLUME) {
    return vazio([
      {
        code: "VOLUME_IRREAL",
        severity: "erro",
        message: "Informe quantas prospecções cabem no período.",
      },
    ]);
  }

  const stages: StageVolume[] = [];
  let volume = Math.floor(topVolume);
  for (const stage of input.stages) {
    stages.push({ id: stage.id, label: stage.label, rate: stage.rate, volume });
    volume = Math.floor((volume * stage.rate) / 100);
  }
  // Saindo do laço, `volume` já passou pela taxa da última etapa: são as
  // conversões.
  const conversoes = volume;
  const topo = stages[0]?.volume ?? 0;

  return {
    requiredConversions: conversoes,
    stages,
    topVolume: topo,
    externalRate: topo > 0 ? (conversoes / topo) * 100 : 0,
    projectedRevenueCents: conversoes * input.ticketCents,
    channels: [],
    channelCoverage: 0,
    diagnostics: [],
  };
}

/** Quantos canais o canvas manda ter, no mínimo. Abaixo disso é aviso. */
export const MINIMO_CANAIS = 5;

/** Duas casas decimais: somar 33,33 três vezes não dá 100 exato. */
function duasCasas(valor: number): number {
  return Math.round(valor * 100) / 100;
}

/**
 * Traduz a fatia de cada canal em prospecções e confere a cobertura.
 *
 * Roda DEPOIS do funil porque depende do topo. Fatia inválida não entra na
 * soma: um share negativo abateria um estouro e faria a cobertura parecer
 * correta justamente quando não está.
 */
export function distribuirCanais(
  resultado: FunnelResult,
  canais: readonly ChannelInput[],
): FunnelResult {
  const diagnostics: Diagnostic[] = [...resultado.diagnostics];
  const channels: ChannelVolume[] = [];
  let cobertura = 0;

  for (const canal of canais) {
    const valida = canal.share >= 0 && canal.share <= 100;
    if (!valida) {
      diagnostics.push({
        code: "FATIA_INVALIDA",
        severity: "erro",
        targetId: canal.id,
        message: `A fatia de "${canal.label}" precisa ficar entre 0 e 100%.`,
      });
    } else {
      cobertura += canal.share;
    }
    channels.push({
      id: canal.id,
      label: canal.label,
      share: canal.share,
      volume: valida ? Math.ceil((resultado.topVolume * canal.share) / 100) : 0,
    });
  }

  if (canais.length > 0 && canais.length < MINIMO_CANAIS) {
    diagnostics.push({
      code: "CANAIS_INSUFICIENTES",
      severity: "aviso",
      message: `O canvas recomenda ao menos ${MINIMO_CANAIS} canais de vendas.`,
    });
  }

  const arredondada = duasCasas(cobertura);
  if (canais.length > 0 && arredondada < 100) {
    diagnostics.push({
      code: "COBERTURA_INCOMPLETA",
      severity: "aviso",
      message: `Os canais cobrem ${arredondada}% da boca do funil. Faltam ${duasCasas(
        100 - arredondada,
      )}%.`,
    });
  }
  if (arredondada > 100) {
    diagnostics.push({
      code: "COBERTURA_EXCEDIDA",
      severity: "aviso",
      message: `Os canais somam ${arredondada}% — ${duasCasas(
        arredondada - 100,
      )}% acima da boca do funil.`,
    });
  }

  return { ...resultado, channels, channelCoverage: arredondada, diagnostics };
}
