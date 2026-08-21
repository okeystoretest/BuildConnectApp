"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { verifyPassword } from "@/lib/auth/password";
import { createSession, destroySession } from "@/lib/auth/session";
import { resolveAccessibleSlugs } from "@/lib/auth/access";
import type { Role } from "@/types";

const loginSchema = z.object({
  username: z.string().trim().min(1, "Informe seu nome de usuário."),
  password: z.string().min(1, "Informe sua senha."),
});

export interface LoginResult {
  ok: boolean;
  error?: string;
}

export async function login(formData: {
  username: string;
  password: string;
}): Promise<LoginResult> {
  const parsed = loginSchema.safeParse(formData);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const { username, password } = parsed.data;

  try {
    const user = await prisma.user.findUnique({
      where: { username },
      include: { sector: true },
    });

    // Mensagem genérica: não revela se o usuário existe.
    const invalid = { ok: false, error: "Usuário ou senha inválidos." } as const;

    if (!user || !user.active) return invalid;

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) return invalid;

    // Resolve os subsetores acessíveis já no login (RBAC de conteúdo).
    const accessSlugs = await resolveAccessibleSlugs(user.id, user.role as Role);

    await createSession({
      userId: user.id,
      role: user.role,
      username: user.username,
      fullName: user.fullName,
      sector: user.sector?.label ?? null,
      avatarPath: user.avatarPath ?? null,
      accessSlugs,
    });

    return { ok: true };
  } catch (error) {
    console.error("[login] falha inesperada:", error);
    return {
      ok: false,
      error: "Erro ao conectar ao servidor. Tente novamente em instantes.",
    };
  }
}

export async function logout(): Promise<void> {
  await destroySession();
  redirect("/login");
}
