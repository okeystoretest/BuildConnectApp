"use server";

import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/require-user";
import { canUseDhoTools } from "@/lib/auth/access";
import { canReachSector } from "@/lib/auth/scope";
import { can } from "@/lib/permissions";
import { getEvaluationDetail } from "@/lib/evaluation-data";
import type { Role } from "@/types";
import type { EvaluationResultDetail } from "@/types/evaluation";

/**
 * Detalhe de uma submissão para expandir na aba Resultados (RH/Admin).
 *
 * O recorte por setor sai de `canReachSector`, o mesmo predicado que o
 * requireRoundScope usa: `sector.hr` (DHO/Admin) alcança todo mundo; o Gestor,
 * só o próprio setor. A página já monta o catálogo com esse recorte
 * (setores/rh/page.tsx), mas Server Action é ponto de entrada separado — a tela
 * filtrar a lista não impede a chamada direta com o id de uma submissão de
 * outro setor.
 */
export async function fetchEvaluationDetail(
  id: string,
): Promise<{ ok: boolean; detail?: EvaluationResultDetail; error?: string }> {
  const actor = await getCurrentUser();
  if (!actor) return { ok: false, error: "Sessão expirada." };
  // Resultados são do RH (sector.hr = Admin) e do Gestor (evaluations.view).
  if (!can(actor.role as Role, "evaluations.view")) {
    return { ok: false, error: "Sem permissão." };
  }
  if (!(await canUseDhoTools(actor.id, actor.role as Role))) {
    return { ok: false, error: "As ferramentas do DHO são exclusivas do setor DHO." };
  }

  const detail = await getEvaluationDetail(id);
  if (!detail) return { ok: false, error: "Avaliação não encontrada." };

  // O setor do avaliado já vem no DTO; só falta o do ator. A consulta é pulada
  // para DHO/Admin, que canReachSector libera sem olhar setor algum.
  const ehHr = can(actor.role as Role, "sector.hr");
  const ator = ehHr
    ? null
    : await prisma.user.findUnique({
        where: { id: actor.id },
        select: { sector: { select: { label: true } } },
      });

  const alcanca = canReachSector({
    role: actor.role as Role,
    actorSector: ator?.sector?.label ?? null,
    subjectSector: detail.subjectSector,
  });
  if (!alcanca) return { ok: false, error: "Sem permissão." };

  return { ok: true, detail };
}
