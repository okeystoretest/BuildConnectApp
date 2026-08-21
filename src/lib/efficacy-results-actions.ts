"use server";

import { getCurrentUser } from "@/lib/auth/require-user";
import { can } from "@/lib/permissions";
import { getEfficacyConsolidated } from "@/lib/efficacy-rounds";
import type { Role } from "@/types";
import type { EfficacyConsolidated } from "@/types/evaluation";

/**
 * Consolidação de uma rodada de Eficácia (médias por competência + coluna de
 * autoavaliação). Exclusivo de quem tem evaluations.view (RH/Gestor/Admin);
 * NUNCA acessível a um avaliador comum — mistura respostas sigilosas.
 */
export async function fetchEfficacyConsolidated(
  roundId: string,
): Promise<{ ok: boolean; data?: EfficacyConsolidated; error?: string }> {
  const actor = await getCurrentUser();
  if (!actor) return { ok: false, error: "Sessão expirada." };
  if (!can(actor.role as Role, "evaluations.view")) {
    return { ok: false, error: "Sem permissão." };
  }
  const data = await getEfficacyConsolidated(roundId);
  if (!data) return { ok: false, error: "Rodada não encontrada." };
  return { ok: true, data };
}
