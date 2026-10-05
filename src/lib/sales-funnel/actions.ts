"use server";

import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { centavosParaDecimal } from "./data";
import { getCurrentUser } from "@/lib/auth/require-user";
import {
  requireFunnelManager,
  requireFunnelScope,
  revalidateFunnelScope,
} from "./guards";
import { gravarCenario, salvarFunilInteiro } from "./core";
import { lerIdentificador, lerStatus } from "./identificadores";

export interface FunnelActionResult {
  ok: boolean;
  error?: string;
  id?: string;
}

/**
 * Escritas do Funil de Vendas.
 *
 * Toda action repete a sequência: sessão → permissão → escopo. O escopo vem
 * do SLUG, nunca do cliente: Marketing e Vendas escrevem na mesma base, e
 * quem decide qual é ela é `resolveAppScope` no servidor.
 *
 * O id do funil entra sempre no `where` JUNTO do `subsectorId`. Sem isso, um
 * id vazado editaria o funil de um setor que o usuário nem enxerga.
 */

/** Valor monetário chega da tela já em centavos inteiros. */
const centavos = z
  .number()
  .int("Valor inválido.")
  .positive("Informe um valor maior que zero.")
  .max(999_999_999_99, "Valor acima do limite.");

const funilSchema = z.object({
  slug: z.string().min(1),
  name: z.string().trim().min(1, "Dê um nome ao funil.").max(80, "Nome muito longo."),
  referenceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida."),
  goalCents: centavos,
  ticketCents: centavos,
  // Equipe e período são OPCIONAIS: sem eles o funil calcula igual, só não
  // mostra plano de ação. Obrigar aqui pararia de salvar os funis que já
  // existem, que nasceram antes destes dois campos.
  sellerCount: z
    .number()
    .int("O número de vendedores precisa ser inteiro.")
    .min(1, "Informe ao menos um vendedor.")
    .max(999, "Número de vendedores acima do limite.")
    .nullish(),
  workingDays: z
    .number()
    .int("Os dias úteis precisam ser um número inteiro.")
    .min(1, "Informe ao menos um dia útil.")
    .max(366, "O período não passa de 366 dias.")
    .nullish(),
  notes: z.string().trim().max(1000, "Observação muito longa.").optional(),
});

const etapaSchema = z.object({
  label: z.string().trim().min(1, "Toda etapa precisa de nome.").max(40, "Nome muito longo."),
  rate: z
    .number()
    .gt(0, "A taxa precisa ser maior que zero.")
    .max(100, "A taxa não passa de 100%."),
  transitionRule: z.string().trim().max(500, "Regra muito longa.").optional(),
});

const canalSchema = z.object({
  label: z.string().trim().min(1, "Todo canal precisa de nome.").max(40, "Nome muito longo."),
  strategy: z.string().trim().max(300, "Estratégia muito longa.").optional(),
  share: z
    .number()
    .min(0, "A fatia não pode ser negativa.")
    .max(100, "A fatia não passa de 100%."),
});

/**
 * O salvamento do editor: funil, etapas e canais numa submissão só.
 *
 * Ser um schema só não é arrumação — é o que permite a transação única. Uma
 * validação por bloco obrigaria a três chamadas, e a do meio destrói as taxas
 * de cenário: falhar depois dela deixava trabalho perdido sem nada gravado em
 * troca.
 */
const salvarFunilSchema = funilSchema.extend({
  stages: z
    .array(etapaSchema)
    .min(3, "O funil precisa de ao menos 3 etapas.")
    .max(6, "O funil aceita no máximo 6 etapas."),
  // Sem mínimo: o canvas RECOMENDA 5, e recomendação vira AVISO no motor, não
  // trava na escrita. Quem está montando o funil salva com dois e volta depois.
  channels: z.array(canalSchema).max(12, "Máximo de 12 canais."),
});

const cenarioSchema = z.object({
  slug: z.string().min(1),
  funnelId: z.string().min(1),
  scenarioId: z.string().optional(),
  name: z.string().trim().min(1, "Dê um nome ao cenário.").max(60, "Nome muito longo."),
  notes: z.string().trim().max(500, "Observação muito longa.").optional(),
  // -100 zera o ticket de propósito: o motor devolve TICKET_INVALIDO e a tela
  // mostra o erro na coluna do cenário. Barrar aqui esconderia a alavanca em
  // vez de explicá-la.
  ticketPercent: z.number().min(-100).max(500),
  // Ausente = o cenário herda o topo do plano. O teto é generoso de propósito:
  // é atividade por vendedor por dia, e um número absurdo é problema do motor
  // (VOLUME_IRREAL), que explica melhor do que uma recusa de formulário.
  opportunitiesPerSellerDay: z
    .number()
    .gt(0, "A atividade diária precisa ser maior que zero.")
    .max(10_000, "Atividade diária acima do limite.")
    .nullish(),
  rates: z.array(z.object({ stageId: z.string().min(1), rate: z.number().gt(0).max(100) })),
});

/**
 * Último recurso em português para o que as regras não nomeiam.
 *
 * Quase todo campo destes schemas já traz a sua frase, e uma mensagem própria
 * tem precedência sobre este mapa — ele só fala quando ninguém falou. O caso
 * que acontece de verdade é o `nan`: a tela manda `Number("abc")` quando se
 * digita letra num campo numérico, e o Zod respondia *"Expected number,
 * received nan"* direto na tela.
 */
const EM_PORTUGUES: z.ZodErrorMap = (issue) => {
  if (issue.code === z.ZodIssueCode.invalid_type) {
    if (issue.received === "nan") return { message: "Informe um número válido." };
    if (issue.received === "undefined" || issue.received === "null") {
      return { message: "Preencha este campo." };
    }
  }
  return { message: "Dados inválidos." };
};

/**
 * "2026-10-01" vira meia-noite em UTC, e não meio-dia no fuso do servidor.
 *
 * A data de referência é um MÊS, não um instante: o que importa é que o dia
 * gravado seja o dia digitado, em qualquer máquina. Sem o `Z`, o JS lê a
 * string no fuso de quem está rodando — e o dia só se sustentava porque o
 * meio-dia dava doze horas de folga, que UTC+13 e UTC+14 já consomem.
 */
function lerDataDeReferencia(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

/** Sessão + permissão + escopo: o preâmbulo de toda escrita. */
async function abrirEscopo(slug: string) {
  const user = await getCurrentUser();
  if (!user) {
    return { user: null, scope: null, error: "Sessão expirada. Faça login novamente." };
  }

  const permissao = requireFunnelManager(user);
  if (permissao.error) return { user: null, scope: null, error: permissao.error };

  const { scope, error: scopeError } = await requireFunnelScope(slug, user);
  if (!scope) return { user: null, scope: null, error: scopeError ?? "Setor não encontrado." };

  return { user, scope, error: null };
}

export async function criarFunil(input: unknown): Promise<FunnelActionResult> {
  const parsed = funilSchema.safeParse(input, { errorMap: EM_PORTUGUES });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const { user, scope, error } = await abrirEscopo(parsed.data.slug);
  if (!scope || !user) return { ok: false, error: error ?? undefined };

  const criado = await prisma.salesFunnel.create({
    data: {
      name: parsed.data.name,
      referenceDate: lerDataDeReferencia(parsed.data.referenceDate),
      goalAmount: centavosParaDecimal(parsed.data.goalCents),
      averageTicket: centavosParaDecimal(parsed.data.ticketCents),
      sellerCount: parsed.data.sellerCount ?? null,
      workingDays: parsed.data.workingDays ?? null,
      notes: parsed.data.notes || null,
      subsectorId: scope.id,
      createdById: user.id,
      // O funil nasce com o modelo sugerido pelo canvas. Três etapas é o
      // mínimo, e vir preenchido é o que faz a ferramenta abrir já mostrando
      // um número em vez de um formulário vazio.
      stages: {
        create: [
          { order: 0, label: "Oportunidades", conversionRate: 50 },
          { order: 1, label: "Visita", conversionRate: 50 },
          { order: 2, label: "Proposta", conversionRate: 20 },
        ],
      },
    },
    select: { id: true },
  });

  await revalidateFunnelScope(scope.id, parsed.data.slug);
  return { ok: true, id: criado.id };
}

/**
 * Salva o funil inteiro: dados, etapas e canais, tudo ou nada.
 *
 * Substituiu `atualizarFunil` + `salvarEtapas` + `salvarCanais`, que a tela
 * disparava em sequência. Ver `salvarFunilInteiro` em `core.ts` para o porquê
 * de a atomicidade importar aqui mais do que nas outras escritas.
 */
export async function salvarFunil(
  funnelId: unknown,
  input: unknown,
): Promise<FunnelActionResult> {
  const id = lerIdentificador(funnelId);
  if (!id) return { ok: false, error: "Funil não encontrado." };

  const parsed = salvarFunilSchema.safeParse(input, { errorMap: EM_PORTUGUES });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const { scope, error } = await abrirEscopo(parsed.data.slug);
  if (!scope) return { ok: false, error: error ?? undefined };

  const gravou = await salvarFunilInteiro(
    id,
    scope.id,
    {
      name: parsed.data.name,
      referenceDate: lerDataDeReferencia(parsed.data.referenceDate),
      goalAmount: centavosParaDecimal(parsed.data.goalCents),
      averageTicket: centavosParaDecimal(parsed.data.ticketCents),
      sellerCount: parsed.data.sellerCount ?? null,
      workingDays: parsed.data.workingDays ?? null,
      notes: parsed.data.notes || null,
    },
    parsed.data.stages,
    parsed.data.channels,
  );
  if (!gravou) return { ok: false, error: "Funil não encontrado." };

  await revalidateFunnelScope(scope.id, parsed.data.slug);
  return { ok: true, id };
}

export async function arquivarFunil(
  slug: string,
  funnelId: unknown,
  status: unknown,
): Promise<FunnelActionResult> {
  const id = lerIdentificador(funnelId);
  if (!id) return { ok: false, error: "Funil não encontrado." };
  const situacao = lerStatus(status);
  if (!situacao) return { ok: false, error: "Situação inválida." };

  const { scope, error } = await abrirEscopo(slug);
  if (!scope) return { ok: false, error: error ?? undefined };

  const alterados = await prisma.salesFunnel.updateMany({
    where: { id, subsectorId: scope.id },
    data: { status: situacao },
  });
  if (alterados.count === 0) return { ok: false, error: "Funil não encontrado." };

  await revalidateFunnelScope(scope.id, slug);
  return { ok: true, id };
}

export async function excluirFunil(slug: string, funnelId: unknown): Promise<FunnelActionResult> {
  const id = lerIdentificador(funnelId);
  if (!id) return { ok: false, error: "Funil não encontrado." };

  const { scope, error } = await abrirEscopo(slug);
  if (!scope) return { ok: false, error: error ?? undefined };

  const apagados = await prisma.salesFunnel.deleteMany({
    where: { id, subsectorId: scope.id },
  });
  if (apagados.count === 0) return { ok: false, error: "Funil não encontrado." };

  await revalidateFunnelScope(scope.id, slug);
  return { ok: true };
}

/** Cria ou substitui um cenário. Devolve o id do CENÁRIO. */
export async function salvarCenario(input: unknown): Promise<FunnelActionResult> {
  const parsed = cenarioSchema.safeParse(input, { errorMap: EM_PORTUGUES });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const { user, scope, error } = await abrirEscopo(parsed.data.slug);
  if (!scope || !user) return { ok: false, error: error ?? undefined };

  const funil = await prisma.salesFunnel.findFirst({
    where: { id: parsed.data.funnelId, subsectorId: scope.id },
    select: { id: true },
  });
  if (!funil) return { ok: false, error: "Funil não encontrado." };

  const scenarioId = await gravarCenario({
    scenarioId: parsed.data.scenarioId,
    funnelId: funil.id,
    name: parsed.data.name,
    notes: parsed.data.notes,
    ticketPercent: parsed.data.ticketPercent,
    opportunitiesPerSellerDay: parsed.data.opportunitiesPerSellerDay ?? null,
    rates: parsed.data.rates,
    createdById: user.id,
  });
  if (!scenarioId) return { ok: false, error: "Cenário não encontrado." };

  await revalidateFunnelScope(scope.id, parsed.data.slug);
  return { ok: true, id: scenarioId };
}

export async function excluirCenario(
  slug: string,
  scenarioId: unknown,
): Promise<FunnelActionResult> {
  const id = lerIdentificador(scenarioId);
  if (!id) return { ok: false, error: "Cenário não encontrado." };

  const { scope, error } = await abrirEscopo(slug);
  if (!scope) return { ok: false, error: error ?? undefined };

  // A checagem de escopo sobe pelo funil: o cenário não guarda subsetor.
  const apagados = await prisma.salesFunnelScenario.deleteMany({
    where: { id, funnel: { subsectorId: scope.id } },
  });
  if (apagados.count === 0) return { ok: false, error: "Cenário não encontrado." };

  await revalidateFunnelScope(scope.id, slug);
  return { ok: true };
}
