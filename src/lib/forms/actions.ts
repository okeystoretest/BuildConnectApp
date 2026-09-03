"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { getVerifiedSession } from "@/lib/auth/require-user";
import { can } from "@/lib/permissions";
import { canEditStructure, NO_SECTOR } from "./rules";
import type { Role } from "@/types";
import type { FormDraft } from "@/types/form";

export interface FormActionResult {
  ok: boolean;
  id?: string;
  error?: string;
}

/** Ator autorizado + seu setor, ou null. */
async function actor(): Promise<{ id: string; role: Role; sectorId: string | null } | null> {
  const session = await getVerifiedSession();
  if (!session) return null;
  const role = session.role as Role;
  if (!can(role, "forms.manage")) return null;
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { sectorId: true },
  });
  return { id: session.userId, role, sectorId: user?.sectorId ?? null };
}

/** Formulário que o ator pode editar, com a contagem que trava a estrutura. */
async function editableForm(formId: string, me: { role: Role; sectorId: string | null }) {
  return prisma.form.findFirst({
    where: {
      id: formId,
      ...(me.role === "ADMIN" ? {} : { ownerSectorId: me.sectorId ?? NO_SECTOR }),
    },
    select: { id: true, status: true, _count: { select: { responses: true } } },
  });
}

export async function createForm(): Promise<FormActionResult> {
  const me = await actor();
  if (!me) return { ok: false, error: "Sem permissão para criar formulários." };

  const form = await prisma.form.create({
    data: {
      title: "Formulário sem título",
      // ADMIN cria formulário da empresa (sem setor); gestor, do próprio setor.
      ownerSectorId: me.role === "ADMIN" ? null : me.sectorId,
      createdById: me.id,
      sections: {
        create: {
          title: "Seção 1",
          order: 0,
          questions: {
            create: {
              kind: "MULTIPLA_ESCOLHA",
              label: "Pergunta sem título",
              order: 0,
              options: { create: [{ label: "Opção 1", order: 0 }] },
            },
          },
        },
      },
    },
    select: { id: true },
  });

  revalidatePath("/setores/rh");
  return { ok: true, id: form.id };
}

const draftSchema = z.object({
  formId: z.string().min(1),
  draft: z.object({
    title: z.string().trim().min(1, "O formulário precisa de um título."),
    description: z.string().trim().optional(),
    sections: z
      .array(
        z.object({
          title: z.string().trim().min(1),
          description: z.string().trim().optional(),
          questions: z.array(
            z.object({
              kind: z.enum([
                "TEXTO_CURTO",
                "PARAGRAFO",
                "MULTIPLA_ESCOLHA",
                "CAIXAS_SELECAO",
                "LISTA_SUSPENSA",
                "ESCALA_LINEAR",
              ]),
              label: z.string().trim().min(1, "Toda pergunta precisa de um enunciado."),
              helpText: z.string().trim().optional(),
              required: z.boolean(),
              options: z.array(z.object({ label: z.string().trim().min(1) })),
              scaleMin: z.number().int().optional(),
              scaleMax: z.number().int().optional(),
              scaleMinLabel: z.string().trim().optional(),
              scaleMaxLabel: z.string().trim().optional(),
            }),
          ),
        }),
      )
      .min(1, "O formulário precisa de ao menos uma seção."),
  }),
});

export async function saveForm(input: {
  formId: string;
  draft: FormDraft;
}): Promise<FormActionResult> {
  const me = await actor();
  if (!me) return { ok: false, error: "Sem permissão." };

  const parsed = draftSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const existing = await editableForm(input.formId, me);
  if (!existing) return { ok: false, error: "Formulário não encontrado." };
  if (!canEditStructure({ status: existing.status, responseCount: existing._count.responses })) {
    return {
      ok: false,
      error: "Este formulário já recebeu respostas. Só título e descrição podem mudar.",
    };
  }

  const { draft } = parsed.data;

  // Substitui a estrutura inteira em transação. É seguro porque a guarda acima
  // garante zero respostas: não há FormAnswer apontando para as perguntas que
  // saem. O cascade do schema limpa perguntas e opções junto com as seções.
  await prisma.$transaction(async (tx) => {
    await tx.form.update({
      where: { id: input.formId },
      data: { title: draft.title, description: draft.description || null },
    });
    await tx.formSection.deleteMany({ where: { formId: input.formId } });
    for (const [si, section] of draft.sections.entries()) {
      await tx.formSection.create({
        data: {
          formId: input.formId,
          title: section.title,
          description: section.description || null,
          order: si,
          questions: {
            create: section.questions.map((q, qi) => ({
              kind: q.kind,
              label: q.label,
              helpText: q.helpText || null,
              required: q.required,
              order: qi,
              scaleMin: q.kind === "ESCALA_LINEAR" ? (q.scaleMin ?? 1) : null,
              scaleMax: q.kind === "ESCALA_LINEAR" ? (q.scaleMax ?? 5) : null,
              scaleMinLabel: q.scaleMinLabel || null,
              scaleMaxLabel: q.scaleMaxLabel || null,
              options: {
                create: q.options.map((o, oi) => ({ label: o.label, order: oi })),
              },
            })),
          },
        },
      });
    }
  });

  revalidatePath(`/setores/rh/formularios/${input.formId}`);
  revalidatePath("/setores/rh");
  return { ok: true };
}

const publishSchema = z.object({
  formId: z.string().min(1),
  userIds: z.array(z.string().min(1)),
  sectorIds: z.array(z.string().min(1)),
  anonymous: z.boolean(),
  dueAt: z.string().optional(),
});

export async function publishForm(input: {
  formId: string;
  userIds: string[];
  sectorIds: string[];
  anonymous: boolean;
  dueAt?: string;
}): Promise<FormActionResult> {
  const me = await actor();
  if (!me) return { ok: false, error: "Sem permissão." };

  const parsed = publishSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Dados inválidos." };

  const existing = await editableForm(input.formId, me);
  if (!existing) return { ok: false, error: "Formulário não encontrado." };
  if (existing.status !== "RASCUNHO") {
    return { ok: false, error: "Este formulário já foi publicado." };
  }

  // Resolve setores + pessoas para uma lista de destinatários. O GESTOR só
  // alcança gente do próprio setor: a cláusula é aplicada aqui, não confiando
  // no que a tela mandou.
  const recipients = await prisma.user.findMany({
    where: {
      active: true,
      ...(me.role === "ADMIN" ? {} : { sectorId: me.sectorId ?? NO_SECTOR }),
      OR: [
        { id: { in: parsed.data.userIds } },
        { sectorId: { in: parsed.data.sectorIds } },
      ],
    },
    select: { id: true },
  });

  if (recipients.length === 0) {
    return { ok: false, error: "Escolha ao menos um destinatário." };
  }

  await prisma.$transaction([
    prisma.form.update({
      where: { id: input.formId },
      data: {
        status: "PUBLICADO",
        anonymous: parsed.data.anonymous,
        publishedAt: new Date(),
        dueAt: parsed.data.dueAt ? new Date(parsed.data.dueAt) : null,
      },
    }),
    prisma.formAssignment.createMany({
      data: recipients.map((r) => ({ formId: input.formId, userId: r.id })),
      skipDuplicates: true,
    }),
  ]);

  revalidatePath("/setores/rh");
  revalidatePath("/minhas-avaliacoes");
  return { ok: true };
}

export async function closeForm(formId: string): Promise<FormActionResult> {
  const me = await actor();
  if (!me) return { ok: false, error: "Sem permissão." };

  const existing = await editableForm(formId, me);
  if (!existing) return { ok: false, error: "Formulário não encontrado." };

  await prisma.form.update({
    where: { id: formId },
    data: { status: "ENCERRADO", closedAt: new Date() },
  });

  revalidatePath("/setores/rh");
  revalidatePath("/minhas-avaliacoes");
  return { ok: true };
}

export async function listFormRecipients(): Promise<{
  users: { id: string; name: string; sector: string }[];
  sectors: { id: string; label: string }[];
}> {
  const me = await actor();
  if (!me) return { users: [], sectors: [] };

  const scoped = me.role === "ADMIN" ? {} : { sectorId: me.sectorId ?? NO_SECTOR };

  const [users, sectors] = await Promise.all([
    prisma.user.findMany({
      where: { active: true, ...scoped },
      select: { id: true, fullName: true, sector: { select: { label: true } } },
      orderBy: { fullName: "asc" },
    }),
    me.role === "ADMIN"
      ? prisma.sector.findMany({ select: { id: true, label: true }, orderBy: { order: "asc" } })
      : prisma.sector.findMany({
          where: { id: me.sectorId ?? NO_SECTOR },
          select: { id: true, label: true },
        }),
  ]);

  return {
    users: users.map((u) => ({ id: u.id, name: u.fullName, sector: u.sector?.label ?? "—" })),
    sectors,
  };
}
