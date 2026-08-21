"use server";

import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/require-user";
import { can } from "@/lib/permissions";
import type { Role } from "@/types";
import { getEmployeeHistory } from "@/lib/hr-history-data";
import type { EmployeeHistory } from "@/types/hr";

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
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sessão expirada." };
  if (!can(user.role as Role, "sector.hr")) {
    return { ok: false, error: "Acesso restrito ao RH." };
  }

  const parsed = z.object({ userId: z.string().min(1) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Colaborador inválido." };

  const history = await getEmployeeHistory(parsed.data.userId);
  if (!history) return { ok: false, error: "Colaborador não encontrado." };

  return { ok: true, history };
}
