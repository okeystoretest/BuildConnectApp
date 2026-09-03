import { prisma } from "@/lib/db/prisma";
import { getVerifiedSession } from "@/lib/auth/require-user";
import { can } from "@/lib/permissions";
import { formScopeFor } from "./rules";
import type { Role } from "@/types";
import type { FormDraft, FormListItem, FormQuestionKind, FormStatus } from "@/types/form";

/**
 * Leitura dos formulários do DHO.
 *
 * O recorte por setor é CLÁUSULA DE CONSULTA, não filtro de tela: o gestor de
 * outro setor não recebe o formulário, em vez de recebê-lo e não vê-lo.
 */

/**
 * Escopo de leitura do ator, já na forma da cláusula `where`.
 * A regra em si mora em `./rules` — aqui só se resolve o setor do usuário.
 */
async function readScope() {
  const session = await getVerifiedSession();
  if (!session) return "denied" as const;
  const role = session.role as Role;
  if (!can(role, "forms.manage")) return "denied" as const;

  const actor = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { sectorId: true },
  });
  return formScopeFor({ role, sectorId: actor?.sectorId ?? null });
}

function dateLabel(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

export async function getFormsForViewer(): Promise<FormListItem[]> {
  const scope = await readScope();
  if (scope === "denied") return [];

  const rows = await prisma.form.findMany({
    where: scope === null ? {} : { ownerSectorId: scope.ownerSectorId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      status: true,
      anonymous: true,
      createdAt: true,
      _count: { select: { responses: true, assignments: true } },
    },
  });

  return rows.map((f) => ({
    id: f.id,
    title: f.title,
    status: f.status as FormStatus,
    anonymous: f.anonymous,
    responseCount: f._count.responses,
    assignedCount: f._count.assignments,
    createdAtLabel: dateLabel(f.createdAt),
  }));
}

export async function getFormDraft(formId: string): Promise<FormDraft | null> {
  const scope = await readScope();
  if (scope === "denied") return null;

  const form = await prisma.form.findFirst({
    where: {
      id: formId,
      ...(scope === null ? {} : { ownerSectorId: scope.ownerSectorId }),
    },
    include: {
      sections: {
        orderBy: { order: "asc" },
        include: {
          questions: {
            orderBy: { order: "asc" },
            include: { options: { orderBy: { order: "asc" } } },
          },
        },
      },
    },
  });
  if (!form) return null;

  return {
    id: form.id,
    title: form.title,
    description: form.description ?? undefined,
    status: form.status as FormStatus,
    anonymous: form.anonymous,
    dueAt: form.dueAt?.toISOString(),
    sections: form.sections.map((s) => ({
      id: s.id,
      title: s.title,
      description: s.description ?? undefined,
      order: s.order,
      questions: s.questions.map((q) => ({
        id: q.id,
        kind: q.kind as FormQuestionKind,
        label: q.label,
        helpText: q.helpText ?? undefined,
        required: q.required,
        order: q.order,
        options: q.options.map((o) => ({ id: o.id, label: o.label, order: o.order })),
        scaleMin: q.scaleMin ?? undefined,
        scaleMax: q.scaleMax ?? undefined,
        scaleMinLabel: q.scaleMinLabel ?? undefined,
        scaleMaxLabel: q.scaleMaxLabel ?? undefined,
      })),
    })),
  };
}
