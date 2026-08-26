import { prisma } from "@/lib/db/prisma";
import {
  getPendingEvaluations,
  getSubjectCycles,
  getEvaluationForm,
  getEvaluationTypeCards,
  getEvaluationSubjects,
  getAllForms,
} from "@/lib/evaluation-data";
import { isMultiRaterSlug } from "@/lib/evaluation-rounds-config";
import type { SectorEvaluations, EvalForm } from "@/types/evaluation";

const PRE_EFETIVO_SLUG = "acompanhamento-pre-efetivo";

/**
 * Setor de gestão de pessoas. É o ÚNICO que não tem a aba de preenchimento —
 * ele concentra os resultados.
 *
 * A comparação é pelo SLUG, nunca pelo rótulo. O setor já foi renomeado de
 * "RH" para "DHO" mantendo o slug `rh` (ver SECTOR_SLUG_OVERRIDES no seed):
 * uma checagem por label quebra silenciosamente na próxima renomeação — e foi
 * exatamente o que aconteceu com o `=== "RH"` anterior.
 */
const PEOPLE_SECTOR_SLUG = "rh";

/**
 * Dados da ferramenta "Avaliações" de um SETOR.
 *
 * O Gestor/Admin escolhe QUAL avaliação fazer e QUAL colaborador avaliar:
 *  - 4 avaliações avulsas: escolha livre (colaborador do setor).
 *  - Pré-Efetivo: escolha do colaborador, mas o ciclo (7/14/21 dias úteis) é
 *    resolvido pelo sistema; se nenhum ciclo estiver disponível, bloqueia.
 *
 * Mantém a fila de ciclos disponíveis como aviso. O DHO não tem esta aba.
 * Escopo de colaboradores: Admin vê todos; Gestor só o próprio setor.
 */
export async function getSectorEvaluations(
  subsectorSlug: string,
  isAdmin: boolean,
): Promise<SectorEvaluations | null> {
  const sub = await prisma.subsector.findUnique({
    where: { slug: subsectorSlug },
    select: { sector: { select: { label: true, slug: true } } },
  });
  if (!sub?.sector) return null;

  if (sub.sector.slug === PEOPLE_SECTOR_SLUG) return null;

  const sectorLabel = sub.sector.label;

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
  // Instrumentos multiavaliador (Matriz de Decisão, Eficácia 360°) também
  // saem: eles não são preenchidos por um gestor sozinho — o DHO atribui os
  // avaliadores em "Resultados de Avaliações › Atribuir Avaliações" e cada
  // avaliador responde em "Minhas Avaliações".
  const avulsas: Record<string, EvalForm> = {};
  for (const [slug, form] of Object.entries(forms)) {
    if (slug !== PRE_EFETIVO_SLUG && !isMultiRaterSlug(slug)) avulsas[slug] = form;
  }

  const selectableTypes = types.filter((t) => !isMultiRaterSlug(t.slug));

  return {
    sectorLabel,
    // Diz à UI o que o estado vazio significa: sem colaborador NO SETOR
    // (Gestor) ou sem colaborador NENHUM cadastrado (Admin, escopo global).
    scope: isAdmin ? "GLOBAL" : "SETOR",
    pending,
    subjects,
    preEfetivoForm,
    types: selectableTypes,
    roster,
    forms: avulsas,
  };
}
