"use server";

import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/require-user";
import { requireApprover, requireWeeklyScope, revalidateWeekly } from "./guards";
import { AGENDA, DELIVERIES, METRICS, OKRS } from "./templates";

/**
 * Escritas do Relatório Semanal.
 *
 * Toda action repete a sequência: sessão → escopo (→ permissão, quando é ato
 * de gestão). O subsetor vem do SLUG, nunca do cliente, e o id do relatório
 * entra sempre no `where` junto do `subsectorId`: sem isso, um id vazado
 * editaria a semana de uma área que o usuário não enxerga.
 *
 * O relatório APROVADO não aceita escrita de linha. A checagem está em
 * `abrirRelatorio`, num lugar só — espalhá-la por action deixaria uma de
 * fora, e seria a que reabre o número depois da aprovação.
 */

export interface WeeklyActionResult {
  ok: boolean;
  error?: string;
  id?: string;
}

const EM_PORTUGUES: z.ZodErrorMap = (issue) => {
  if (issue.code === z.ZodIssueCode.invalid_type) {
    if (issue.received === "nan") return { message: "Informe um número válido." };
    if (issue.received === "undefined" || issue.received === "null") {
      return { message: "Preencha este campo." };
    }
  }
  return { message: "Dados inválidos." };
};

const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.");
const health = z.enum(["NO_RITMO", "ATENCAO", "TRAVADO"]).nullish();
const textoCurto = z.string().trim().max(200, "Texto muito longo.").nullish();
const textoLongo = z.string().trim().max(2000, "Texto muito longo.").nullish();

/**
 * Número de métrica ou de OKR.
 *
 * `nullish` porque a célula em branco é um estado legítimo — a planilha
 * trazia "—" em toda linha não apurada, e as contas de `math` já respondem
 * "sem valor" em vez de zero. O teto evita que um dedo escorregado no teclado
 * numérico vire alcance de um bilhão sem ninguém notar.
 */
const numero = z
  .number()
  .finite("Informe um número válido.")
  .min(-1_000_000_000, "Número fora da faixa.")
  .max(1_000_000_000, "Número fora da faixa.")
  .nullish();

/** "2026-11-17" → meia-noite em UTC, a mesma régua das colunas `@db.Date`. */
function lerDia(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

/** Sessão + escopo: o preâmbulo de toda escrita. */
async function abrirEscopo(slug: string) {
  const user = await getCurrentUser();
  if (!user) {
    return { user: null, scope: null, error: "Sessão expirada. Faça login novamente." };
  }
  const { scope, error } = await requireWeeklyScope(slug, user);
  if (!scope) return { user: null, scope: null, error: error ?? "Setor não encontrado." };
  return { user, scope, error: null };
}

/**
 * Escopo + o relatório, já conferido contra ele e contra a aprovação.
 *
 * `permitirAprovado` abre a exceção para quem aprova: é assim que a gestão
 * corrige um número depois de fechar a semana, sem reabrir o relatório.
 */
async function abrirRelatorio(slug: string, reportId: string) {
  const { user, scope, error } = await abrirEscopo(slug);
  if (!scope || !user) return { user: null, scope: null, report: null, error };

  const report = await prisma.weeklyReport.findFirst({
    where: { id: reportId, subsectorId: scope.id },
    select: { id: true, status: true },
  });
  if (!report) {
    return { user: null, scope: null, report: null, error: "Relatório não encontrado." };
  }
  if (report.status === "APROVADO" && requireApprover(user).error) {
    return {
      user: null,
      scope: null,
      report: null,
      error: "Relatório aprovado. Peça ao gestor para reabri-lo antes de editar.",
    };
  }
  return { user, scope, report, error: null };
}

// ─────────────────────────────────────────────────────────────
// O relatório
// ─────────────────────────────────────────────────────────────

const criarSchema = z.object({
  slug: z.string().min(1),
  weekNumber: z
    .number()
    .int("O número da semana precisa ser inteiro.")
    .min(1, "A semana começa em 1.")
    .max(53, "O ano não tem mais de 53 semanas."),
  periodStart: dia,
  periodEnd: dia,
});

/**
 * Cria a semana já preenchida com os modelos da planilha.
 *
 * As 22 entregas, 20 métricas, 9 OKRs e 5 blocos de pauta entram numa
 * escrita aninhada só — é uma transação implícita do Prisma, e é o que impede
 * um relatório nascer com as entregas e sem as métricas.
 */
export async function criarRelatorio(input: unknown): Promise<WeeklyActionResult> {
  const parsed = criarSchema.safeParse(input, { errorMap: EM_PORTUGUES });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const { weekNumber, periodStart, periodEnd, slug } = parsed.data;
  if (periodEnd < periodStart) {
    return { ok: false, error: "O fim do período não pode ser antes do início." };
  }

  const { user, scope, error } = await abrirEscopo(slug);
  if (!scope || !user) return { ok: false, error: error ?? undefined };

  const jaExiste = await prisma.weeklyReport.findUnique({
    where: { subsectorId_periodStart: { subsectorId: scope.id, periodStart: lerDia(periodStart) } },
    select: { id: true },
  });
  if (jaExiste) {
    return { ok: false, error: "Já existe um relatório para esta semana." };
  }

  const criado = await prisma.weeklyReport.create({
    data: {
      subsectorId: scope.id,
      createdById: user.id,
      weekNumber,
      periodStart: lerDia(periodStart),
      periodEnd: lerDia(periodEnd),
      deliveries: {
        create: DELIVERIES.map((d, order) => ({ order, ...d })),
      },
      metrics: {
        create: METRICS.map((m, order) => ({
          order,
          channel: m.channel,
          metric: m.metric,
          target: m.target ?? null,
        })),
      },
      okrs: {
        create: OKRS.map((o, order) => ({
          order,
          objective: o.objective,
          keyResult: o.keyResult,
          measure: o.measure,
          goalLabel: o.goalLabel,
          goalValue: o.goalValue ?? null,
          monthlyRead: o.monthlyRead ?? false,
        })),
      },
      agenda: {
        create: AGENDA.map((a, order) => ({ order, ...a })),
      },
    },
    select: { id: true },
  });

  revalidateWeekly(slug);
  return { ok: true, id: criado.id };
}

const resumoSchema = z.object({
  slug: z.string().min(1),
  reportId: z.string().min(1),
  weekNumber: criarSchema.shape.weekNumber,
  periodStart: dia,
  periodEnd: dia,
  highlight: textoLongo,
  learning: textoLongo,
  nextPriority: textoLongo,
});

/** A aba 1: o cabeçalho e os três campos longos do resumo. */
export async function salvarResumo(input: unknown): Promise<WeeklyActionResult> {
  const parsed = resumoSchema.safeParse(input, { errorMap: EM_PORTUGUES });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const { slug, reportId, periodStart, periodEnd } = parsed.data;
  if (periodEnd < periodStart) {
    return { ok: false, error: "O fim do período não pode ser antes do início." };
  }

  const { report, error } = await abrirRelatorio(slug, reportId);
  if (!report) return { ok: false, error: error ?? undefined };

  await prisma.weeklyReport.update({
    where: { id: report.id },
    data: {
      weekNumber: parsed.data.weekNumber,
      periodStart: lerDia(periodStart),
      periodEnd: lerDia(periodEnd),
      highlight: parsed.data.highlight || null,
      learning: parsed.data.learning || null,
      nextPriority: parsed.data.nextPriority || null,
    },
  });

  revalidateWeekly(slug);
  return { ok: true, id: report.id };
}

/**
 * Uma seção inteira de modelo fixo, numa transação.
 *
 * Quatro seções na mesma action porque o ato é o mesmo — gravar linhas que já
 * existem, dentro de um relatório já conferido. Quatro actions seriam quatro
 * cópias do mesmo preâmbulo, e o preâmbulo é a parte que não pode divergir.
 *
 * A seção inteira, e não linha a linha, porque é assim que a planilha era
 * usada: preenche-se a aba e fecha-se o arquivo. Vinte linhas em vinte
 * chamadas deixariam a tela em um estado que não existe no banco se a décima
 * falhasse.
 *
 * O texto do modelo (dia, bloco, entrega prevista, pergunta) NÃO entra aqui:
 * é a cópia congelada na criação, e deixá-lo editável apagaria a diferença
 * entre "não cumpri a rotina" e "mudei a rotina".
 */
const secaoSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("delivery"),
    slug: z.string().min(1),
    reportId: z.string().min(1),
    rows: z
      .array(
        z.object({ id: z.string().min(1), health, evidence: textoCurto, note: textoLongo }),
      )
      .max(60, "Seção com linhas demais."),
  }),
  z.object({
    kind: z.literal("metric"),
    slug: z.string().min(1),
    reportId: z.string().min(1),
    rows: z
      .array(
        z.object({
          id: z.string().min(1),
          previous: numero,
          current: numero,
          target: textoCurto,
          health,
          reading: textoLongo,
        }),
      )
      .max(60, "Seção com linhas demais."),
  }),
  z.object({
    kind: z.literal("okr"),
    slug: z.string().min(1),
    reportId: z.string().min(1),
    rows: z
      .array(
        z.object({ id: z.string().min(1), achieved: numero, health, nextStep: textoLongo }),
      )
      .max(60, "Seção com linhas demais."),
  }),
  z.object({
    kind: z.literal("agenda"),
    slug: z.string().min(1),
    reportId: z.string().min(1),
    rows: z
      .array(z.object({ id: z.string().min(1), answer: textoLongo }))
      .max(60, "Seção com linhas demais."),
  }),
]);

/** As linhas que REALMENTE pertencem a este relatório, por tabela. */
async function idsDaSecao(kind: string, reportId: string): Promise<Set<string>> {
  const where = { reportId };
  const select = { id: true };
  const rows =
    kind === "delivery"
      ? await prisma.weeklyReportDelivery.findMany({ where, select })
      : kind === "metric"
        ? await prisma.weeklyReportMetric.findMany({ where, select })
        : kind === "okr"
          ? await prisma.weeklyReportOkr.findMany({ where, select })
          : await prisma.weeklyReportAgendaItem.findMany({ where, select });
  return new Set(rows.map((r) => r.id));
}

export async function salvarSecao(input: unknown): Promise<WeeklyActionResult> {
  const parsed = secaoSchema.safeParse(input, { errorMap: EM_PORTUGUES });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const data = parsed.data;
  const { report, error } = await abrirRelatorio(data.slug, data.reportId);
  if (!report) return { ok: false, error: error ?? undefined };

  // Os ids são conferidos ANTES de escrever: o relatório já foi conferido
  // contra o setor, e cada linha é conferida contra o relatório. Um id de
  // fora não escreve em nada — e também não passa em silêncio.
  const validos = await idsDaSecao(data.kind, report.id);
  if (data.rows.some((r) => !validos.has(r.id))) {
    return { ok: false, error: "Esta seção mudou. Recarregue a página e tente de novo." };
  }
  if (data.rows.length === 0) return { ok: true, id: report.id };

  // Um array só, montado por `push`: o ternário aninhado produzia uma UNIÃO
  // de tipos de array, que a sobrecarga do `$transaction` não aceita.
  const ops: Prisma.PrismaPromise<unknown>[] = [];
  if (data.kind === "delivery") {
    for (const r of data.rows) {
      ops.push(
        prisma.weeklyReportDelivery.update({
          where: { id: r.id },
          data: {
            health: r.health ?? null,
            evidence: r.evidence || null,
            note: r.note || null,
          },
        }),
      );
    }
  } else if (data.kind === "metric") {
    for (const r of data.rows) {
      ops.push(
        prisma.weeklyReportMetric.update({
          where: { id: r.id },
          data: {
            previous: r.previous ?? null,
            current: r.current ?? null,
            target: r.target || null,
            health: r.health ?? null,
            reading: r.reading || null,
          },
        }),
      );
    }
  } else if (data.kind === "okr") {
    for (const r of data.rows) {
      ops.push(
        prisma.weeklyReportOkr.update({
          where: { id: r.id },
          data: {
            achieved: r.achieved ?? null,
            health: r.health ?? null,
            nextStep: r.nextStep || null,
          },
        }),
      );
    }
  } else {
    for (const r of data.rows) {
      ops.push(
        prisma.weeklyReportAgendaItem.update({
          where: { id: r.id },
          data: { answer: r.answer || null },
        }),
      );
    }
  }

  await prisma.$transaction(ops);

  revalidateWeekly(data.slug);
  return { ok: true, id: report.id };
}

// ─────────────────────────────────────────────────────────────
// Bloqueios e decisões — a única seção sem modelo fixo
// ─────────────────────────────────────────────────────────────

const bloqueioSchema = z.object({
  slug: z.string().min(1),
  reportId: z.string().min(1),
  /** Ausente = criar. */
  blockerId: z.string().min(1).optional(),
  title: z.string().trim().min(1, "Descreva o bloqueio.").max(500, "Descrição muito longa."),
  impact: textoLongo,
  needs: textoCurto,
  dueDate: dia.nullish(),
  health,
  resolution: textoLongo,
});

export async function salvarBloqueio(input: unknown): Promise<WeeklyActionResult> {
  const parsed = bloqueioSchema.safeParse(input, { errorMap: EM_PORTUGUES });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const d = parsed.data;
  const { report, error } = await abrirRelatorio(d.slug, d.reportId);
  if (!report) return { ok: false, error: error ?? undefined };

  const campos = {
    title: d.title,
    impact: d.impact || null,
    needs: d.needs || null,
    dueDate: d.dueDate ? lerDia(d.dueDate) : null,
    health: d.health ?? null,
    resolution: d.resolution || null,
  };

  if (d.blockerId) {
    const { count } = await prisma.weeklyReportBlocker.updateMany({
      where: { id: d.blockerId, reportId: report.id },
      data: campos,
    });
    if (count === 0) return { ok: false, error: "Bloqueio não encontrado." };
    revalidateWeekly(d.slug);
    return { ok: true, id: d.blockerId };
  }

  const ultimo = await prisma.weeklyReportBlocker.findFirst({
    where: { reportId: report.id },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  const criado = await prisma.weeklyReportBlocker.create({
    data: { reportId: report.id, order: (ultimo?.order ?? -1) + 1, ...campos },
    select: { id: true },
  });

  revalidateWeekly(d.slug);
  return { ok: true, id: criado.id };
}

export async function excluirBloqueio(input: unknown): Promise<WeeklyActionResult> {
  const parsed = z
    .object({ slug: z.string().min(1), reportId: z.string().min(1), blockerId: z.string().min(1) })
    .safeParse(input, { errorMap: EM_PORTUGUES });
  if (!parsed.success) return { ok: false, error: "Dados inválidos." };

  const { report, error } = await abrirRelatorio(parsed.data.slug, parsed.data.reportId);
  if (!report) return { ok: false, error: error ?? undefined };

  const { count } = await prisma.weeklyReportBlocker.deleteMany({
    where: { id: parsed.data.blockerId, reportId: report.id },
  });
  if (count === 0) return { ok: false, error: "Bloqueio não encontrado." };

  revalidateWeekly(parsed.data.slug);
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────
// O ciclo da semana: enviar → aprovar → (reabrir)
// ─────────────────────────────────────────────────────────────

const cicloSchema = z.object({
  slug: z.string().min(1),
  reportId: z.string().min(1),
  acao: z.enum(["enviar", "aprovar", "reabrir"]),
});

/**
 * As três transições de estado, numa action.
 *
 * As datas de envio e de aprovação são gravadas AQUI, pelo servidor. Na
 * planilha eram duas células digitadas — e uma entrega atrasada vinha com o
 * horário que o preenchimento quisesse.
 */
export async function definirStatusRelatorio(input: unknown): Promise<WeeklyActionResult> {
  const parsed = cicloSchema.safeParse(input, { errorMap: EM_PORTUGUES });
  if (!parsed.success) return { ok: false, error: "Dados inválidos." };
  const { slug, reportId, acao } = parsed.data;

  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sessão expirada. Faça login novamente." };

  const { scope, error } = await requireWeeklyScope(slug, user);
  if (!scope) return { ok: false, error: error ?? undefined };

  if (acao !== "enviar") {
    const permissao = requireApprover(user);
    if (permissao.error) return { ok: false, error: permissao.error };
  }

  const report = await prisma.weeklyReport.findFirst({
    where: { id: reportId, subsectorId: scope.id },
    select: { id: true, status: true, submittedAt: true },
  });
  if (!report) return { ok: false, error: "Relatório não encontrado." };

  if (acao === "enviar") {
    if (report.status !== "RASCUNHO") {
      return { ok: false, error: "Este relatório já foi enviado." };
    }
    await prisma.weeklyReport.update({
      where: { id: report.id },
      data: { status: "ENVIADO", submittedAt: new Date() },
    });
  } else if (acao === "aprovar") {
    if (report.status === "APROVADO") {
      return { ok: false, error: "Este relatório já está aprovado." };
    }
    const agora = new Date();
    await prisma.weeklyReport.update({
      where: { id: report.id },
      data: {
        status: "APROVADO",
        // Aprovar um rascunho aprova também a entrega: sem isto a semana
        // ficaria aprovada e sem data de envio, e a planilha registrava as
        // duas coisas. Quem já havia enviado mantém a hora do envio.
        submittedAt: report.submittedAt ?? agora,
        approvedAt: agora,
        approvedById: user.id,
      },
    });
  } else {
    if (report.status === "RASCUNHO") {
      return { ok: false, error: "Este relatório já está em rascunho." };
    }
    // Reabrir volta ao rascunho e APAGA a aprovação. Guardar quem aprovou uma
    // versão que já mudou seria assinar um relatório que não existe mais.
    await prisma.weeklyReport.update({
      where: { id: report.id },
      data: { status: "RASCUNHO", approvedAt: null, approvedById: null },
    });
  }

  revalidateWeekly(slug);
  return { ok: true, id: report.id };
}

export async function excluirRelatorio(input: unknown): Promise<WeeklyActionResult> {
  const parsed = z
    .object({ slug: z.string().min(1), reportId: z.string().min(1) })
    .safeParse(input, { errorMap: EM_PORTUGUES });
  if (!parsed.success) return { ok: false, error: "Dados inválidos." };

  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sessão expirada. Faça login novamente." };

  const permissao = requireApprover(user);
  if (permissao.error) return { ok: false, error: permissao.error };

  const { scope, error } = await requireWeeklyScope(parsed.data.slug, user);
  if (!scope) return { ok: false, error: error ?? undefined };

  // As linhas vão com ele por `onDelete: Cascade` no schema.
  const { count } = await prisma.weeklyReport.deleteMany({
    where: { id: parsed.data.reportId, subsectorId: scope.id },
  });
  if (count === 0) return { ok: false, error: "Relatório não encontrado." };

  revalidateWeekly(parsed.data.slug);
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────
// Kanban (abas 7 e 8)
// ─────────────────────────────────────────────────────────────

const tarefaSchema = z.object({
  slug: z.string().min(1),
  /** Ausente = criar. */
  taskId: z.string().min(1).optional(),
  title: z.string().trim().min(1, "Dê um nome à tarefa.").max(300, "Nome muito longo."),
  category: z.enum(["CONTEUDO", "PUBLICACAO", "COMUNIDADE", "RELATORIO", "PROCESSO"]),
  priority: z.enum(["ALTA", "MEDIA", "BAIXA"]),
  assignee: textoCurto,
  dueDate: dia.nullish(),
  evidence: textoCurto,
  note: textoLongo,
});

/**
 * Próximo código do quadro ("K-13").
 *
 * Lido do maior código EXISTENTE, e não da contagem de cartões: contar daria
 * "K-12" de novo assim que alguém excluísse um cartão do meio, e o código é a
 * forma de citar a tarefa na reunião.
 */
async function proximoCodigo(subsectorId: string): Promise<string> {
  const codigos = await prisma.marketingTask.findMany({
    where: { subsectorId },
    select: { code: true },
  });
  let maior = 0;
  for (const { code } of codigos) {
    const n = Number(code.replace(/^K-/, ""));
    if (Number.isInteger(n) && n > maior) maior = n;
  }
  return `K-${String(maior + 1).padStart(2, "0")}`;
}

export async function salvarTarefa(input: unknown): Promise<WeeklyActionResult> {
  const parsed = tarefaSchema.safeParse(input, { errorMap: EM_PORTUGUES });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const d = parsed.data;
  const { user, scope, error } = await abrirEscopo(d.slug);
  if (!scope || !user) return { ok: false, error: error ?? undefined };

  const campos = {
    title: d.title,
    category: d.category,
    priority: d.priority,
    assignee: d.assignee || null,
    dueDate: d.dueDate ? lerDia(d.dueDate) : null,
    evidence: d.evidence || null,
    note: d.note || null,
  };

  if (d.taskId) {
    const { count } = await prisma.marketingTask.updateMany({
      where: { id: d.taskId, subsectorId: scope.id },
      data: campos,
    });
    if (count === 0) return { ok: false, error: "Tarefa não encontrada." };
    revalidateWeekly(d.slug);
    return { ok: true, id: d.taskId };
  }

  const criado = await prisma.marketingTask.create({
    data: {
      subsectorId: scope.id,
      createdById: user.id,
      code: await proximoCodigo(scope.id),
      ...campos,
    },
    select: { id: true },
  });

  revalidateWeekly(d.slug);
  return { ok: true, id: criado.id };
}

const moverSchema = z.object({
  slug: z.string().min(1),
  taskId: z.string().min(1),
  status: z.enum(["BACKLOG", "A_FAZER", "EM_ANDAMENTO", "REVISAO", "PUBLICADO"]),
});

export async function moverTarefa(input: unknown): Promise<WeeklyActionResult> {
  const parsed = moverSchema.safeParse(input, { errorMap: EM_PORTUGUES });
  if (!parsed.success) return { ok: false, error: "Dados inválidos." };
  const { slug, taskId, status } = parsed.data;

  const { scope, error } = await abrirEscopo(slug);
  if (!scope) return { ok: false, error: error ?? undefined };

  const task = await prisma.marketingTask.findFirst({
    where: { id: taskId, subsectorId: scope.id },
    select: { id: true, evidence: true, status: true },
  });
  if (!task) return { ok: false, error: "Tarefa não encontrada." };
  if (task.status === status) return { ok: true, id: task.id };

  // A regra escrita na aba de instruções: nada chega a Publicado sem prova.
  if (status === "PUBLICADO" && !task.evidence) {
    return {
      ok: false,
      error: "Toda tarefa precisa de evidência (link ou print) antes de ir para Publicado.",
    };
  }

  await prisma.marketingTask.update({
    where: { id: task.id },
    // Voltar de Publicado limpa a data de conclusão: o cartão não está
    // concluído, e a data sobrevivente contaria como entrega no histórico.
    data: { status, doneAt: status === "PUBLICADO" ? new Date() : null },
  });

  revalidateWeekly(slug);
  return { ok: true, id: task.id };
}

export async function excluirTarefa(input: unknown): Promise<WeeklyActionResult> {
  const parsed = z
    .object({ slug: z.string().min(1), taskId: z.string().min(1) })
    .safeParse(input, { errorMap: EM_PORTUGUES });
  if (!parsed.success) return { ok: false, error: "Dados inválidos." };

  const { scope, error } = await abrirEscopo(parsed.data.slug);
  if (!scope) return { ok: false, error: error ?? undefined };

  const { count } = await prisma.marketingTask.deleteMany({
    where: { id: parsed.data.taskId, subsectorId: scope.id },
  });
  if (count === 0) return { ok: false, error: "Tarefa não encontrada." };

  revalidateWeekly(parsed.data.slug);
  return { ok: true };
}
