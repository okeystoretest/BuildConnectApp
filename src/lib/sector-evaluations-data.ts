import { prisma } from "@/lib/db/prisma";
import {
  getPendingEvaluations,
  getSubjectCycles,
  getEvaluationForm,
  getEvaluationTypeCards,
  getEvaluationSubjects,
  getAllForms,
} from "@/lib/evaluation-data";
import type { SectorEvaluations, EvalForm } from "@/types/evaluation";

const PRE_EFETIVO_SLUG = "acompanhamento-pre-efetivo";

/**
 * Dados da ferramenta "Avaliações" de um SETOR.
 *
 * O Gestor/Admin escolhe QUAL avaliação fazer e QUAL colaborador avaliar:
 *  - 4 avaliações avulsas: escolha livre (colaborador do setor).
 *  - Pré-Efetivo: escolha do colaborador, mas o ciclo (7/14/21 dias úteis) é
 *    resolvido pelo sistema; se nenhum ciclo estiver disponível, bloqueia.
 *
 * Mantém a fila de ciclos disponíveis como aviso. RH não tem esta aba.
 * Escopo de colaboradores: Admin vê todos; Gestor só o próprio setor.
 */
export async function getSectorEvaluations(
  subsectorSlug: string,
  isAdmin: boolean,
): Promise<SectorEvaluations | null> {
  const sub = await prisma.subsector.findUnique({
    where: { slug: subsectorSlug },
    select: { sector: { select: { label: true } } },
  });
  if (!sub?.sector) return null;

  const sectorLabel = sub.sector.label;
  if (sectorLabel.toUpperCase() === "RH") return null;

  // Admin: sem filtro de setor. Gestor: escopo no setor da página.
  const scope = isAdmin ? null : [sectorLabel];

  const [pending, subjects, preEfetivoForm, types, roster, forms] = await Promise.all([
    getPendingEvaluations(scope),
    getSubjectCycles(scope),
    getEvaluationForm(PRE_EFETIVO_SLUG),
    getEvaluationTypeCards(),
    getEvaluationSubjects(scope),
    getAllForms(),
  ]);

  // Pré-Efetivo sai do dicionário de avulsas (tem fluxo próprio de ciclo).
  const avulsas: Record<string, EvalForm> = {};
  for (const [slug, form] of Object.entries(forms)) {
    if (slug !== PRE_EFETIVO_SLUG) avulsas[slug] = form;
  }

  return { sectorLabel, pending, subjects, preEfetivoForm, types, roster, forms: avulsas };
}
