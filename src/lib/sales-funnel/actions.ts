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
import { gravarCenario, substituirCanais, substituirEtapas } from "./core";

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

const etapasSchema = z.object({
  slug: z.string().min(1),
  funnelId: z.string().min(1),
  stages: z
    .array(etapaSchema)
    .min(3, "O funil precisa de ao menos 3 etapas.")
    .max(6, "O funil aceita no máximo 6 etapas."),
});

const canalSchema = z.object({
  label: z.string().trim().min(1, "Todo canal precisa de nome.").max(40, "Nome muito longo."),
  strategy: z.string().trim().max(300, "Estratégia muito longa.").optional(),
  share: z
    .number()
    .min(0, "A fatia não pode ser negativa.")
    .max(100, "A fatia não passa de 100%."),
});

const canaisSchema = z.object({
  slug: z.string().min(1),
  funnelId: z.string().min(1),
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
  topPercent: z.number().min(-100).max(500),
  rates: z.array(z.object({ stageId: z.string().min(1), rate: z.number().gt(0).max(100) })),
});

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
  const parsed = funilSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const { user, scope, error } = await abrirEscopo(parsed.data.slug);
  if (!scope || !user) return { ok: false, error: error ?? undefined };

  const criado = await prisma.salesFunnel.create({
    data: {
      name: parsed.data.name,
      referenceDate: new Date(`${parsed.data.referenceDate}T12:00:00`),
      goalAmount: centavosParaDecimal(parsed.data.goalCents),
      averageTicket: centavosParaDecimal(parsed.data.ticketCents),
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

export async function atualizarFunil(
  funnelId: string,
  input: unknown,
): Promise<FunnelActionResult> {
  const parsed = funilSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const { scope, error } = await abrirEscopo(parsed.data.slug);
  if (!scope) return { ok: false, error: error ?? undefined };

  const alterados = await prisma.salesFunnel.updateMany({
    where: { id: funnelId, subsectorId: scope.id },
    data: {
      name: parsed.data.name,
      referenceDate: new Date(`${parsed.data.referenceDate}T12:00:00`),
      goalAmount: centavosParaDecimal(parsed.data.goalCents),
      averageTicket: centavosParaDecimal(parsed.data.ticketCents),
      notes: parsed.data.notes || null,
    },
  });
  if (alterados.count === 0) return { ok: false, error: "Funil não encontrado." };

  await revalidateFunnelScope(scope.id, parsed.data.slug);
  return { ok: true, id: funnelId };
}

export async function arquivarFunil(
  slug: string,
  funnelId: string,
  status: "RASCUNHO" | "ATIVO" | "ARQUIVADO",
): Promise<FunnelActionResult> {
  const { scope, error } = await abrirEscopo(slug);
  if (!scope) return { ok: false, error: error ?? undefined };

  const alterados = await prisma.salesFunnel.updateMany({
    where: { id: funnelId, subsectorId: scope.id },
    data: { status },
  });
  if (alterados.count === 0) return { ok: false, error: "Funil não encontrado." };

  await revalidateFunnelScope(scope.id, slug);
  return { ok: true, id: funnelId };
}

export async function excluirFunil(slug: string, funnelId: string): Promise<FunnelActionResult> {
  const { scope, error } = await abrirEscopo(slug);
  if (!scope) return { ok: false, error: error ?? undefined };

  const apagados = await prisma.salesFunnel.deleteMany({
    where: { id: funnelId, subsectorId: scope.id },
  });
  if (apagados.count === 0) return { ok: false, error: "Funil não encontrado." };

  await revalidateFunnelScope(scope.id, slug);
  return { ok: true };
}

/**
 * Substitui a lista de etapas inteira, em transação.
 *
 * Apagar e recriar num `$transaction` é o que garante que `@@unique([funnelId,
 * order])` nunca veja um estado intermediário com ordem duplicada — e que um
 * erro no meio não deixe o funil com metade das etapas.
 *
 * Os ids das etapas MUDAM a cada salvamento. Por isso as taxas de cenário que
 * apontavam para elas somem junto, pela cascata do banco: um cenário não pode
 * apontar para uma etapa que deixou de existir. A tela avisa antes.
 */
export async function salvarEtapas(input: unknown): Promise<FunnelActionResult> {
  const parsed = etapasSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const { scope, error } = await abrirEscopo(parsed.data.slug);
  if (!scope) return { ok: false, error: error ?? undefined };

  const funil = await prisma.salesFunnel.findFirst({
    where: { id: parsed.data.funnelId, subsectorId: scope.id },
    select: { id: true },
  });
  if (!funil) return { ok: false, error: "Funil não encontrado." };

  await substituirEtapas(funil.id, parsed.data.stages);

  await revalidateFunnelScope(scope.id, parsed.data.slug);
  return { ok: true, id: funil.id };
}

/** Substitui a lista de canais inteira. */
export async function salvarCanais(input: unknown): Promise<FunnelActionResult> {
  const parsed = canaisSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const { scope, error } = await abrirEscopo(parsed.data.slug);
  if (!scope) return { ok: false, error: error ?? undefined };

  const funil = await prisma.salesFunnel.findFirst({
    where: { id: parsed.data.funnelId, subsectorId: scope.id },
    select: { id: true },
  });
  if (!funil) return { ok: false, error: "Funil não encontrado." };

  await substituirCanais(funil.id, parsed.data.channels);

  await revalidateFunnelScope(scope.id, parsed.data.slug);
  return { ok: true, id: funil.id };
}

/** Cria ou substitui um cenário. Devolve o id do CENÁRIO. */
export async function salvarCenario(input: unknown): Promise<FunnelActionResult> {
  const parsed = cenarioSchema.safeParse(input);
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
    topPercent: parsed.data.topPercent,
    rates: parsed.data.rates,
    createdById: user.id,
  });
  if (!scenarioId) return { ok: false, error: "Cenário não encontrado." };

  await revalidateFunnelScope(scope.id, parsed.data.slug);
  return { ok: true, id: scenarioId };
}

export async function excluirCenario(
  slug: string,
  scenarioId: string,
): Promise<FunnelActionResult> {
  const { scope, error } = await abrirEscopo(slug);
  if (!scope) return { ok: false, error: error ?? undefined };

  // A checagem de escopo sobe pelo funil: o cenário não guarda subsetor.
  const apagados = await prisma.salesFunnelScenario.deleteMany({
    where: { id: scenarioId, funnel: { subsectorId: scope.id } },
  });
  if (apagados.count === 0) return { ok: false, error: "Cenário não encontrado." };

  await revalidateFunnelScope(scope.id, slug);
  return { ok: true };
}
