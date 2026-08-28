"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/require-user";
import { can } from "@/lib/permissions";
import { getReportsHistory } from "@/lib/reports/data";
import type { Role } from "@/types";
import type { ReportItem } from "@/types/report";

/**
 * Tratativa das denúncias — área do DHO, atrás de `reports.manage`.
 *
 * O que este módulo NÃO tem, por decisão de produto: exclusão. Não existe
 * `deleteReport` em lugar nenhum do sistema — uma denúncia registrada não sai
 * do banco em hipótese alguma. O fim da linha é o status ENCERRADA, que apenas
 * a tira do quadro (após 30 minutos) e a manda para o histórico.
 */

export interface ReportActionResult {
  ok: boolean;
  error?: string;
}

async function requireHandler() {
  const user = await getCurrentUser();
  if (!user) return { user: null, error: "Sessão expirada. Faça login novamente." };
  if (!can(user.role as Role, "reports.manage")) {
    return { user: null, error: "Apenas o DHO tem acesso à Central de Denúncias." };
  }
  return { user, error: null };
}

const statusSchema = z.object({
  reportId: z.string().min(1),
  status: z.enum(["ABERTA", "EM_ANALISE", "ENCERRADA"]),
  /** Tratativa registrada junto com a mudança de status (opcional). */
  handlingNote: z.string().trim().max(2000, "Anotação muito longa.").optional(),
});

/**
 * Move a denúncia no fluxo Aberta → Em análise → Encerrada.
 *
 * `closedAt` é gravado ao ENCERRAR e limpo ao reabrir: é ele que inicia (ou
 * cancela) a janela de 30 minutos antes do arquivamento. Sem esse cuidado,
 * reabrir uma denúncia a deixaria com um carimbo antigo e ela sumiria do
 * quadro no instante seguinte.
 */
export async function setReportStatus(input: {
  reportId: string;
  status: "ABERTA" | "EM_ANALISE" | "ENCERRADA";
  handlingNote?: string;
}): Promise<ReportActionResult> {
  const { user, error } = await requireHandler();
  if (!user) return { ok: false, error: error ?? undefined };

  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const { reportId, status, handlingNote } = parsed.data;

  try {
    const current = await prisma.report.findUnique({
      where: { id: reportId },
      select: { id: true },
    });
    if (!current) return { ok: false, error: "Denúncia não encontrada." };

    await prisma.report.update({
      where: { id: reportId },
      data: {
        status,
        closedAt: status === "ENCERRADA" ? new Date() : null,
        ...(handlingNote !== undefined ? { handlingNote: handlingNote || null } : {}),
      },
    });

    revalidatePath("/setores/rh");
    return { ok: true };
  } catch (e) {
    console.error("[setReportStatus] db:", e);
    return { ok: false, error: "Não foi possível atualizar a denúncia." };
  }
}

const noteSchema = z.object({
  reportId: z.string().min(1),
  handlingNote: z.string().trim().max(2000, "Anotação muito longa."),
});

/** Registra/atualiza a tratativa do DHO sem mexer no status. */
export async function saveReportNote(input: {
  reportId: string;
  handlingNote: string;
}): Promise<ReportActionResult> {
  const { user, error } = await requireHandler();
  if (!user) return { ok: false, error: error ?? undefined };

  const parsed = noteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  try {
    await prisma.report.update({
      where: { id: parsed.data.reportId },
      data: { handlingNote: parsed.data.handlingNote || null },
    });
    revalidatePath("/setores/rh");
    return { ok: true };
  } catch (e) {
    console.error("[saveReportNote] db:", e);
    return { ok: false, error: "Não foi possível salvar a tratativa." };
  }
}

export interface ReportHistoryResult {
  ok: boolean;
  reports: ReportItem[];
  error?: string;
}

/** Histórico do módulo: denúncias encerradas que já saíram do quadro. */
export async function listReportHistory(): Promise<ReportHistoryResult> {
  const { user, error } = await requireHandler();
  if (!user) return { ok: false, reports: [], error: error ?? undefined };

  try {
    return { ok: true, reports: await getReportsHistory() };
  } catch (e) {
    console.error("[listReportHistory] db:", e);
    return { ok: false, reports: [], error: "Não foi possível carregar o histórico." };
  }
}
