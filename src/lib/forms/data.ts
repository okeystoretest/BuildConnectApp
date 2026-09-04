import { prisma } from "@/lib/db/prisma";
import { getVerifiedSession } from "@/lib/auth/require-user";
import { can } from "@/lib/permissions";
import { formScopeFor } from "./rules";
import { formsInScope, formDraftInScope, formResultsInScope } from "./data-core";
import type { ReadScope, FormResults } from "./data-core";
import type { Role } from "@/types";
import type { FormDraft, FormListItem } from "@/types/form";

export type { FormResults } from "./data-core";

/**
 * Leitura dos formulários do DHO, para quem está logado.
 *
 * Resolve o escopo a partir da sessão e delega a `./data-core`. A regra do
 * recorte mora em `./rules` (`formScopeFor`), que é onde ela tem teste — aqui
 * só se descobre o setor do usuário.
 */
async function readScope(): Promise<ReadScope | "denied"> {
  const session = await getVerifiedSession();
  if (!session) return "denied";
  const role = session.role as Role;
  if (!can(role, "forms.manage")) return "denied";

  const actor = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { sectorId: true },
  });
  return formScopeFor({ role, sectorId: actor?.sectorId ?? null });
}

export async function getFormsForViewer(): Promise<FormListItem[]> {
  const scope = await readScope();
  if (scope === "denied") return [];
  return formsInScope(scope);
}

export async function getFormDraft(formId: string): Promise<FormDraft | null> {
  const scope = await readScope();
  if (scope === "denied") return null;
  return formDraftInScope(scope, formId);
}

export async function getFormResults(
  formId: string,
  round?: number,
): Promise<FormResults | null> {
  const scope = await readScope();
  if (scope === "denied") return null;
  return formResultsInScope(scope, formId, round);
}
