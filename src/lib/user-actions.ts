"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/require-user";
import { hashPassword } from "@/lib/auth/password";
import { generatePassword } from "@/lib/auth/generate-password";
import { can } from "@/lib/permissions";
import type { Role } from "@/types";
import { processAndStoreImage, ImageProcessingError } from "@/lib/storage/images";
import { removeFile } from "@/lib/storage/files";
import { ensureCycleSchedule } from "@/lib/evaluation-schedule";
import { USERNAME_PATTERN, MIN_PASSWORD_LENGTH } from "@/types/user-form";


/** Detecta violação de unicidade do Prisma (P2002) sem depender do tipo gerado. */
function isUniqueViolation(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code?: unknown }).code === "P2002"
  );
}

export interface UserActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  /**
   * Credenciais recém-criadas, retornadas APENAS na criação, para o modal de
   * sucesso. A senha em claro só existe aqui, uma única vez — não é persistida
   * nem exibida novamente. O admin copia e repassa ao colaborador.
   */
  credentials?: { username: string; password: string };
}

async function requireManager() {
  const actor = await getCurrentUser();
  if (!actor) return { actor: null, error: "Sessão expirada. Faça login novamente." };
  if (!can(actor.role as Role, "users.manage")) {
    return { actor: null, error: "Você não tem permissão para gerenciar usuários." };
  }
  return { actor, error: null };
}

/** Resolve setor, unidade e subsetores por rótulo → ids. */
async function resolveRefs(sectorLabel: string, unitLabel: string, subsectorLabels: string[]) {
  const [sector, unit] = await Promise.all([
    sectorLabel ? prisma.sector.findFirst({ where: { label: sectorLabel } }) : null,
    unitLabel ? prisma.unit.findFirst({ where: { label: unitLabel } }) : null,
  ]);
  const subs = subsectorLabels.length
    ? await prisma.subsector.findMany({ where: { label: { in: subsectorLabels } } })
    : [];
  return { sectorId: sector?.id ?? null, unitId: unit?.id ?? null, subIds: subs.map((s: { id: string }) => s.id) };
}

const baseSchema = z.object({
  fullName: z.string().trim().min(1, "Informe o nome completo."),
  username: z
    .string()
    .trim()
    .regex(USERNAME_PATTERN, "Use o padrão nome#BC, em minúsculas."),
  role: z.enum(["COLABORADOR", "GESTOR", "ADMIN"]),
  sector: z.string().trim().min(1, "Selecione o setor."),
  unit: z.string().trim().min(1, "Selecione a unidade."),
  subsectors: z.array(z.string()).default([]),
});

// ──────────────────────────────────────────────
// Criar usuário
// ──────────────────────────────────────────────

export async function createUser(formData: FormData): Promise<UserActionResult> {
  const { actor, error } = await requireManager();
  if (!actor) return { ok: false, error: error ?? undefined };

  const raw = {
    fullName: formData.get("fullName"),
    username: formData.get("username"),
    role: formData.get("role"),
    sector: formData.get("sector"),
    unit: formData.get("unit"),
    subsectors: formData.getAll("subsectors").map(String),
  };

  const parsed = baseSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) {
      const k = i.path[0];
      if (typeof k === "string" && !fieldErrors[k]) fieldErrors[k] = i.message;
    }
    return { ok: false, error: "Revise os campos.", fieldErrors };
  }
  const data = parsed.data;

  // Senha gerada automaticamente no servidor — o admin não a digita.
  // Exibida uma única vez no modal de sucesso (retorno `credentials`).
  const plainPassword = generatePassword();

  // Avatar opcional (sharp → .webp).
  let avatarPath: string | null = null;
  let avatarAbs: string | null = null;
  const photo = formData.get("photo");
  if (photo instanceof File && photo.size > 0) {
    try {
      const stored = await processAndStoreImage(photo, "avatares");
      avatarPath = stored.publicPath;
      avatarAbs = stored.absolutePath;
    } catch (e) {
      if (e instanceof ImageProcessingError) return { ok: false, error: e.message };
      console.error("[createUser] avatar:", e);
      return { ok: false, error: "Falha ao processar a foto." };
    }
  }

  try {
    const { sectorId, unitId, subIds } = await resolveRefs(data.sector, data.unit, data.subsectors);
    const passwordHash = await hashPassword(plainPassword);

    let createdUserId = "";
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const user = await tx.user.create({
        data: {
          username: data.username,
          fullName: data.fullName,
          passwordHash,
          role: data.role,
          sectorId,
          unitId,
          avatarPath,
        },
      });
      createdUserId = user.id;
      if (subIds.length > 0) {
        await tx.userSubsector.createMany({
          data: subIds.map((subsectorId: string) => ({ userId: user.id, subsectorId })),
        });
      }
    });

    // Colaboradores entram no ciclo de Acompanhamento Pré-Efetivo (7/14/21
    // dias úteis a partir do cadastro). Gestores/Admins não são avaliados.
    if (data.role === "COLABORADOR" && createdUserId) {
      try {
        await ensureCycleSchedule(createdUserId);
      } catch (e) {
        // Falha na agenda não deve derrubar o cadastro; loga e segue.
        console.error("[createUser] agenda de ciclos:", e);
      }
    }

    revalidatePath("/setores/rh");
    return { ok: true, credentials: { username: data.username, password: plainPassword } };
  } catch (e) {
    if (avatarAbs) await removeFile(avatarAbs);
    // Violação de unicidade do username.
    if (isUniqueViolation(e)) {
      return { ok: false, fieldErrors: { username: "Este nome de usuário já existe." } };
    }
    console.error("[createUser] db:", e);
    return { ok: false, error: "Falha ao criar o usuário." };
  }
}

// ──────────────────────────────────────────────
// Atualizar usuário
// ──────────────────────────────────────────────

export async function updateUser(formData: FormData): Promise<UserActionResult> {
  const { actor, error } = await requireManager();
  if (!actor) return { ok: false, error: error ?? undefined };

  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "Usuário inválido." };

  const raw = {
    fullName: formData.get("fullName"),
    username: formData.get("username"),
    role: formData.get("role"),
    sector: formData.get("sector"),
    unit: formData.get("unit"),
    subsectors: formData.getAll("subsectors").map(String),
  };
  const parsed = baseSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) {
      const k = i.path[0];
      if (typeof k === "string" && !fieldErrors[k]) fieldErrors[k] = i.message;
    }
    return { ok: false, error: "Revise os campos.", fieldErrors };
  }
  const data = parsed.data;

  // Situação atual, para saber se a edição exige derrubar as sessões abertas.
  const atual = await prisma.user.findUnique({
    where: { id },
    select: { role: true },
  });

  // Senha só é trocada se informada manualmente na edição.
  const password = String(formData.get("password") ?? "");
  if (password && password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, fieldErrors: { password: `Mínimo de ${MIN_PASSWORD_LENGTH} caracteres.` } };
  }

  // Avatar novo (opcional).
  let avatarPath: string | undefined;
  let avatarAbs: string | null = null;
  const photo = formData.get("photo");
  if (photo instanceof File && photo.size > 0) {
    try {
      const stored = await processAndStoreImage(photo, "avatares");
      avatarPath = stored.publicPath;
      avatarAbs = stored.absolutePath;
    } catch (e) {
      if (e instanceof ImageProcessingError) return { ok: false, error: e.message };
      console.error("[updateUser] avatar:", e);
      return { ok: false, error: "Falha ao processar a foto." };
    }
  }

  try {
    const { sectorId, unitId, subIds } = await resolveRefs(data.sector, data.unit, data.subsectors);
    const passwordHash = password ? await hashPassword(password) : undefined;

    // Trocar a senha ou mudar o papel derruba as sessões abertas do usuário na
    // hora — sem isso, quem foi rebaixado continuaria com o papel antigo até o
    // token vencer, e a senha antiga seguiria valendo em outro navegador.
    const revogarSessoes = Boolean(passwordHash) || (atual !== null && atual.role !== data.role);

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.user.update({
        where: { id },
        data: {
          username: data.username,
          fullName: data.fullName,
          role: data.role,
          sectorId,
          unitId,
          ...(passwordHash ? { passwordHash } : {}),
          ...(avatarPath ? { avatarPath } : {}),
          ...(revogarSessoes ? { sessionVersion: { increment: 1 } } : {}),
        },
      });
      // Recria vínculos de subsetor.
      await tx.userSubsector.deleteMany({ where: { userId: id } });
      if (subIds.length > 0) {
        await tx.userSubsector.createMany({
          data: subIds.map((subsectorId: string) => ({ userId: id, subsectorId })),
        });
      }
    });

    revalidatePath("/setores/rh");
    return { ok: true };
  } catch (e) {
    if (avatarAbs) await removeFile(avatarAbs);
    if (isUniqueViolation(e)) {
      return { ok: false, fieldErrors: { username: "Este nome de usuário já existe." } };
    }
    console.error("[updateUser] db:", e);
    return { ok: false, error: "Falha ao atualizar o usuário." };
  }
}

// ──────────────────────────────────────────────
// Remover usuário (desativa o acesso)
// ──────────────────────────────────────────────

export async function deleteUser(id: string): Promise<UserActionResult> {
  const { actor, error } = await requireManager();
  if (!actor) return { ok: false, error: error ?? undefined };

  if (id === actor.id) {
    return { ok: false, error: "Você não pode remover a própria conta." };
  }

  try {
    // Soft delete: desativa em vez de apagar — preserva histórico de chamados
    // etc. A versão de sessão sobe junto: quem estava logado cai na hora.
    await prisma.user.update({
      where: { id },
      data: { active: false, sessionVersion: { increment: 1 } },
    });
    revalidatePath("/setores/rh");
    return { ok: true };
  } catch (e) {
    console.error("[deleteUser] db:", e);
    return { ok: false, error: "Falha ao remover o usuário." };
  }
}
