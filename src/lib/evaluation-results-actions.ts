"use server";

import { getCurrentUser } from "@/lib/auth/require-user";
import { can } from "@/lib/permissions";
import { getEvaluationDetail } from "@/lib/evaluation-data";
import type { Role } from "@/types";
import type { EvaluationResultDetail } from "@/types/evaluation";

/** Detalhe de uma submissão para expandir na aba Resultados (RH/Admin). */
export async function fetchEvaluationDetail(
  id: string,
): Promise<{ ok: boolean; detail?: EvaluationResultDetail; error?: string }> {
  const actor = await getCurrentUser();
  if (!actor) return { ok: false, error: "Sessão expirada." };
  // Resultados são do RH (sector.hr = Admin) e do Gestor (evaluations.view).
  if (!can(actor.role as Role, "evaluations.view")) {
    return { ok: false, error: "Sem permissão." };
  }

  const detail = await getEvaluationDetail(id);
  if (!detail) return { ok: false, error: "Avaliação não encontrada." };
  return { ok: true, detail };
}
