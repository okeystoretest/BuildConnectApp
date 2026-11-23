"use server";

import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/require-user";
import { ImageProcessingError, processAndStoreImage } from "@/lib/storage/images";
import { requireApprover, requireWeeklyScope, revalidateWeekly } from "./guards";
import { AGENDA } from "./templates";

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

/**
 * Evidência: um caminho de upload nosso ou um endereço http(s). Nada mais.
 *
 * A tela mostra a evidência como `<img src>` ou como `<a href>`, e é por isso
 * que o esquema é conferido AQUI: um `javascript:` digitado no campo de link
 * viraria execução de script no clique de quem lê o relatório. Fronteira de
 * confiança não se valida só no navegador.
 */
const evidencia = z
  .string()
  .trim()
  .max(500, "Endereço muito longo.")
  .refine(
    (v) => v === "" || v.startsWith("/uploads/") || /^https?:\/\//i.test(v),
    "A evidência precisa ser um link http(s) ou uma imagem enviada.",
  )
  .nullish();
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
      // Só a PAUTA nasce pronta. Entregas, métricas e OKRs são montados pela
      // semana: eram listas fixas da planilha, e a predefinição saiu em
      // 23/11/2026 — linha que não se apaga vira linha que se ignora.
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
 * Uma seção de linhas, substituída inteira numa transação.
 *
 * As quatro na mesma action porque o ato é o mesmo — gravar as linhas de um
 * relatório já conferido. Quatro actions seriam quatro cópias do mesmo
 * preâmbulo, e o preâmbulo é a parte que não pode divergir.
 *
 * A seção inteira, e não linha a linha, porque é assim que se preenche: abre-se
 * a seção, mexe-se em várias linhas e salva-se. Vinte linhas em vinte chamadas
 * deixariam a tela num estado que não existe no banco se a décima falhasse.
 *
 * ENTREGAS, MÉTRICAS e OKRs são APAGADOS E RECRIADOS, como `substituirEtapas`
 * no Funil: desde 23/11/2026 a semana monta as próprias linhas, então criar,
 * editar, reordenar e excluir são o mesmo gesto — mandar a lista como ela
 * ficou. A `order` vem da POSIÇÃO no array, nunca do cliente, e é isso que
 * impede buraco (0,1,3) e empate (0,1,1). Os ids mudam a cada salvamento, e
 * ninguém aponta para eles: a média de 4 semanas casa os OKRs pelo TEXTO do
 * resultado-chave, justamente por isso.
 *
 * A PAUTA é a exceção: ela continua sendo roteiro fixo, então aqui só a
 * RESPOSTA é gravada. Deixar o bloco e a pergunta editáveis apagaria a
 * diferença entre "não respondi" e "mudei a pergunta".
 */
const secaoSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("delivery"),
    slug: z.string().min(1),
    reportId: z.string().min(1),
    rows: z
      .array(
        z.object({
          day: textoCurto,
          block: textoCurto,
          expected: z
            .string()
            .trim()
            .min(1, "Toda entrega precisa de uma descrição.")
            .max(500, "Descrição muito longa."),
          health,
          evidence: evidencia,
          note: textoLongo,
        }),
      )
      .max(60, "Máximo de 60 entregas por semana."),
  }),
  z.object({
    kind: z.literal("metric"),
    slug: z.string().min(1),
    reportId: z.string().min(1),
    rows: z
      .array(
        z.object({
          channel: z
            .string()
            .trim()
            .min(1, "Toda métrica precisa de um canal.")
            .max(80, "Nome de canal muito longo."),
          metric: z
            .string()
            .trim()
            .min(1, "Toda linha precisa do nome da métrica.")
            .max(120, "Nome de métrica muito longo."),
          previous: numero,
          current: numero,
          target: textoCurto,
          health,
          reading: textoLongo,
        }),
      )
      .max(60, "Máximo de 60 métricas por semana."),
  }),
  z.object({
    kind: z.literal("okr"),
    slug: z.string().min(1),
    reportId: z.string().min(1),
    rows: z
      .array(
        z.object({
          objective: textoCurto,
          keyResult: z
            .string()
            .trim()
            .min(1, "Todo resultado-chave precisa de um nome.")
            .max(300, "Nome muito longo."),
          measure: textoLongo,
          goalLabel: textoCurto,
          goalValue: numero,
          monthlyRead: z.boolean().optional(),
          achieved: numero,
          health,
          nextStep: textoLongo,
        }),
      )
      .max(60, "Máximo de 60 resultados-chave por semana."),
  }),
  z.object({
    kind: z.literal("agenda"),
    slug: z.string().min(1),
    reportId: z.string().min(1),
    rows: z
      .array(z.object({ id: z.string().min(1), answer: textoLongo }))
      .max(20, "Seção com linhas demais."),
  }),
]);

export async function salvarSecao(input: unknown): Promise<WeeklyActionResult> {
  const parsed = secaoSchema.safeParse(input, { errorMap: EM_PORTUGUES });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const data = parsed.data;
  const { report, error } = await abrirRelatorio(data.slug, data.reportId);
  if (!report) return { ok: false, error: error ?? undefined };

  // A pauta é roteiro fixo: só a resposta muda, e a linha é conferida contra o
  // relatório pelo `reportId` no WHERE.
  if (data.kind === "agenda") {
    const validos = await prisma.weeklyReportAgendaItem.findMany({
      where: { reportId: report.id },
      select: { id: true },
    });
    const conhecidos = new Set(validos.map((r) => r.id));
    if (data.rows.some((r) => !conhecidos.has(r.id))) {
      return { ok: false, error: "Esta seção mudou. Recarregue a página e tente de novo." };
    }
    await prisma.$transaction(
      data.rows.map((r) =>
        prisma.weeklyReportAgendaItem.update({
          where: { id: r.id },
          data: { answer: r.answer || null },
        }),
      ),
    );
    revalidateWeekly(data.slug);
    return { ok: true, id: report.id };
  }

  // As demais: apaga e recria dentro de UMA transação. O id que veio do
  // cliente é ignorado de propósito — a linha é identificada pela posição.
  const ops: Prisma.PrismaPromise<unknown>[] = [];
  if (data.kind === "delivery") {
    ops.push(prisma.weeklyReportDelivery.deleteMany({ where: { reportId: report.id } }));
    ops.push(
      prisma.weeklyReportDelivery.createMany({
        data: data.rows.map((r, order) => ({
          reportId: report.id,
          order,
          day: r.day || "",
          block: r.block || "",
          expected: r.expected,
          health: r.health ?? null,
          evidence: r.evidence || null,
          note: r.note || null,
        })),
      }),
    );
  } else if (data.kind === "metric") {
    ops.push(prisma.weeklyReportMetric.deleteMany({ where: { reportId: report.id } }));
    ops.push(
      prisma.weeklyReportMetric.createMany({
        data: data.rows.map((r, order) => ({
          reportId: report.id,
          order,
          channel: r.channel,
          metric: r.metric,
          previous: r.previous ?? null,
          current: r.current ?? null,
          target: r.target || null,
          health: r.health ?? null,
          reading: r.reading || null,
        })),
      }),
    );
  } else {
    ops.push(prisma.weeklyReportOkr.deleteMany({ where: { reportId: report.id } }));
    ops.push(
      prisma.weeklyReportOkr.createMany({
        data: data.rows.map((r, order) => ({
          reportId: report.id,
          order,
          objective: r.objective || "",
          keyResult: r.keyResult,
          measure: r.measure || "",
          goalLabel: r.goalLabel || "",
          goalValue: r.goalValue ?? null,
          monthlyRead: r.monthlyRead ?? false,
          achieved: r.achieved ?? null,
          health: r.health ?? null,
          nextStep: r.nextStep || null,
        })),
      }),
    );
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
  evidence: evidencia,
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

/**
 * Envia um print como evidência e devolve o caminho público.
 *
 * Server Action, e não a rota `/api/uploads`: aquela existe para dar PROGRESSO
 * em arquivo grande (vídeo de 110 MB), e um print não precisa de barra de
 * progresso. O que ela faria aqui de útil, a action já faz.
 *
 * A imagem é reprocessada por `processAndStoreImage` — redimensiona, corrige a
 * orientação do EXIF e converte para .webp. O banco guarda só o CAMINHO, como
 * todo arquivo do sistema; nunca o binário.
 *
 * Grava, mas NÃO associa: quem escreve o caminho no cartão é `salvarTarefa`,
 * com o resto do formulário. Separá-los é o que permite trocar a imagem antes
 * de salvar sem deixar o cartão apontando para um arquivo descartado.
 */
export async function enviarEvidencia(
  formData: FormData,
): Promise<{ ok: boolean; path?: string; error?: string }> {
  const slug = String(formData.get("slug") ?? "");
  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Nenhuma imagem recebida." };
  }

  const { scope, error } = await abrirEscopo(slug);
  if (!scope) return { ok: false, error: error ?? undefined };

  try {
    // Categoria `conteudo`: é material de marketing, com a mesma retenção do
    // resto do conteúdo de setor. Não é dado sensível e não pede pasta própria.
    const imagem = await processAndStoreImage(file, "conteudo");
    return { ok: true, path: imagem.publicPath };
  } catch (e) {
    const motivo =
      e instanceof ImageProcessingError ? e.message : "Falha ao processar a imagem.";
    if (!(e instanceof ImageProcessingError)) {
      console.error("[weekly-report] evidência:", e);
    }
    return { ok: false, error: motivo };
  }
}
