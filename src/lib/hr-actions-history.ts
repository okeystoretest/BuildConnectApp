"use server";

import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/require-user";
import { canUseDhoTools } from "@/lib/auth/access";
import { can } from "@/lib/permissions";
import type { Role } from "@/types";
import { getEmployeeHistory, searchEmployeesByName } from "@/lib/hr-history-data";
import type { EmployeeHistory, EmployeeSummary } from "@/types/hr";

/**
 * Mesma régua das duas actions: `sector.hr` é permissão de papel (só ADMIN a
 * tem), e a lotação é outra pergunta — é ela que decide desde a restrição do
 * setor. Devolve o motivo da recusa, ou null quando pode seguir.
 */
async function requireDhoAdmin(): Promise<string | null> {
  const user = await getCurrentUser();
  if (!user) return "Sessão expirada.";
  if (!can(user.role as Role, "sector.hr")) return "Acesso restrito ao DHO.";
  if (!(await canUseDhoTools(user.id, user.role as Role))) return "Acesso restrito ao DHO.";
  return null;
}

/**
 * Busca de colaboradores para a lista do histórico. A página só carrega os
 * cinco cadastros mais recentes; todo o resto chega por aqui, sob demanda.
 */
export async function searchEmployees(
  query: string,
): Promise<{ ok: boolean; employees: EmployeeSummary[]; error?: string }> {
  const denied = await requireDhoAdmin();
  if (denied) return { ok: false, employees: [], error: denied };

  const parsed = z.string().trim().min(1).max(80).safeParse(query);
  if (!parsed.success) return { ok: true, employees: [] };

  return { ok: true, employees: await searchEmployeesByName(parsed.data) };
}

export interface HistoryResult {
  ok: boolean;
  history?: EmployeeHistory;
  error?: string;
}

/**
 * Busca o histórico de um colaborador sob demanda (troca de seleção no
 * painel de RH). Leitura, mas restrita a quem tem acesso ao RH (sector.hr).
 */
export async function fetchEmployeeHistory(input: {
  userId: string;
}): Promise<HistoryResult> {
  const denied = await requireDhoAdmin();
  if (denied) return { ok: false, error: denied };

  const parsed = z.object({ userId: z.string().min(1) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Colaborador inválido." };

  const history = await getEmployeeHistory(parsed.data.userId);
  if (!history) return { ok: false, error: "Colaborador não encontrado." };

  return { ok: true, history };
}
