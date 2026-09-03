import { notFound, redirect } from "next/navigation";
import { getVerifiedSession } from "@/lib/auth/require-user";
import { can } from "@/lib/permissions";
import { getFormDraft } from "@/lib/forms/data";
import { FormBuilder } from "@/components/forms/form-builder";
import type { Role } from "@/types";

export const dynamic = "force-dynamic";

export default async function FormBuilderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getVerifiedSession();
  if (!session) redirect("/login");
  if (!can(session.role as Role, "forms.manage")) notFound();

  const { id } = await params;
  // getFormDraft já recorta por setor: o gestor de outro setor recebe null,
  // não um formulário que a tela precisaria esconder.
  const draft = await getFormDraft(id);
  if (!draft) notFound();

  return <FormBuilder initial={draft} />;
}
