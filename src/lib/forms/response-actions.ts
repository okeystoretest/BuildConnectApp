"use server";

import { revalidatePath } from "next/cache";
import { getVerifiedSession } from "@/lib/auth/require-user";
import { assignedFormFor, submitResponseFor } from "./response-core";
import type { FormAnswerInput, FormDraft } from "@/types/form";

/**
 * Preenchimento de formulário pelo destinatário.
 *
 * Resolve a sessão e delega a `./response-core`. A guarda é a ATRIBUIÇÃO, não
 * `forms.manage` — quem responde é colaborador e não tem, nem deve ter,
 * permissão de gestão. Por isso em arquivo separado do construtor.
 */

export async function getAssignedForm(formId: string): Promise<FormDraft | null> {
  const session = await getVerifiedSession();
  if (!session) return null;
  return assignedFormFor(session.userId, formId);
}

export async function submitFormResponse(input: {
  formId: string;
  answers: FormAnswerInput[];
}): Promise<{ ok: boolean; error?: string }> {
  const session = await getVerifiedSession();
  if (!session) return { ok: false, error: "Sessão expirada. Faça login novamente." };

  const result = await submitResponseFor(session.userId, input);
  if (result.ok) revalidatePath("/minhas-avaliacoes");
  return result;
}
