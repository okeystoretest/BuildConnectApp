"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { getVerifiedSession } from "@/lib/auth/require-user";
import { can } from "@/lib/permissions";
import {
  closeFormFor,
  deleteFormFor,
  listRecipientsFor,
  publishFormFor,
  reopenFormFor,
  saveFormFor,
  type FormActor,
} from "./core";
import { getFormResults, type FormResults } from "./data";
import type { RemovalImpact } from "./rules";
import type { Role } from "@/types";
import type { FormDraft } from "@/types/form";

/**
 * Ações do construtor.
 *
 * Este arquivo faz duas coisas e só duas: resolve QUEM está pedindo e revalida
 * as rotas depois. O trabalho mora em `./core`, que recebe o ator por parâmetro
 * — é o que permite testá-lo contra um banco de verdade, já que
 * `getVerifiedSession()` depende do cookie da requisição e não existe fora de
 * uma.
 */

export interface FormActionResult {
  ok: boolean;
  id?: string;
  error?: string;
  /** saveForm: o que a gravação destruiria. Vem quando ela é recusada. */
  removals?: RemovalImpact[];
  /** deleteForm: quantas respostas a exclusão levaria junto. */
  responseCount?: number;
}

/** Ator autorizado + seu setor, ou null. */
async function actor(): Promise<FormActor | null> {
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

const DENIED: FormActionResult = { ok: false, error: "Sem permissão." };

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
  confirmRemovals: z.boolean().optional(),
  draft: z.object({
    title: z.string().trim().min(1, "O formulário precisa de um título."),
    description: z.string().trim().optional(),
    sections: z
      .array(
        z.object({
          id: z.string().min(1),
          title: z.string().trim().min(1),
          description: z.string().trim().optional(),
          questions: z.array(
            z.object({
              id: z.string().min(1),
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
              options: z.array(
                z.object({ id: z.string().min(1), label: z.string().trim().min(1) }),
              ),
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
  confirmRemovals?: boolean;
}): Promise<FormActionResult> {
  const me = await actor();
  if (!me) return DENIED;

  // O id de cada linha virou dado de verdade: é ele que liga o que a tela
  // devolve ao que está gravado, e portanto o que preserva as respostas. Por
  // isso o schema passou a exigi-lo em seção, pergunta e opção.
  const parsed = draftSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const result = await saveFormFor(me, input);
  if (result.ok) {
    revalidatePath(`/setores/rh/formularios/${input.formId}`);
    revalidatePath("/setores/rh");
  }
  return result;
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
  if (!me) return DENIED;

  const parsed = publishSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Dados inválidos." };

  const result = await publishFormFor(me, parsed.data);
  if (result.ok) {
    revalidatePath("/setores/rh");
    revalidatePath("/minhas-avaliacoes");
  }
  return result;
}

export async function closeForm(formId: string): Promise<FormActionResult> {
  const me = await actor();
  if (!me) return DENIED;

  const result = await closeFormFor(me, formId);
  if (result.ok) {
    revalidatePath("/setores/rh");
    revalidatePath("/minhas-avaliacoes");
  }
  return result;
}

export async function reopenForm(formId: string): Promise<FormActionResult> {
  const me = await actor();
  if (!me) return DENIED;

  const result = await reopenFormFor(me, formId);
  if (result.ok) {
    revalidatePath("/setores/rh");
    revalidatePath("/minhas-avaliacoes");
  }
  return result;
}

export async function deleteForm(input: {
  formId: string;
  confirmation?: string;
}): Promise<FormActionResult> {
  const me = await actor();
  if (!me) return DENIED;

  const result = await deleteFormFor(me, input);
  if (result.ok) {
    revalidatePath("/setores/rh");
    revalidatePath("/minhas-avaliacoes");
  }
  return result;
}

export async function listFormRecipients(): Promise<{
  users: { id: string; name: string; sector: string }[];
  sectors: { id: string; label: string }[];
}> {
  const me = await actor();
  if (!me) return { users: [], sectors: [] };
  return listRecipientsFor(me);
}

/**
 * Resultados, para o painel do DHO buscar sob demanda.
 *
 * A leitura mora em `./data`, que não é "use server" — este invólucro é o que
 * a torna chamável do cliente. O recorte por setor não se repete aqui: vem de
 * `getFormDraft`, dentro de `getFormResults`.
 */
export async function fetchFormResults(
  formId: string,
  round?: number,
): Promise<FormResults | null> {
  return getFormResults(formId, round);
}
