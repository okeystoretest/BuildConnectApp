"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { verifyPassword } from "@/lib/auth/password";
import { createSession, destroySession } from "@/lib/auth/session";
import { resolveAccessibleSlugs } from "@/lib/auth/access";
import { consume, reset, clientIp } from "@/lib/rate-limit";
import type { Role } from "@/types";

/**
 * Tetos de tentativa de login.
 *
 * Por usuário barra a força bruta contra uma conta específica; por IP barra a
 * varredura de várias contas a partir do mesmo lugar. O padrão de usuário é
 * público (nome#BC), então o nome não é segredo — só a senha é.
 */
const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS_PER_USER = 8;
const MAX_ATTEMPTS_PER_IP = 30;

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

  const ip = await clientIp();
  const userKey = "login:user:" + username.toLowerCase();
  const ipKey = "login:ip:" + ip;

  const perUser = await consume(userKey, MAX_ATTEMPTS_PER_USER, LOGIN_WINDOW_MS);
  const perIp = await consume(ipKey, MAX_ATTEMPTS_PER_IP, LOGIN_WINDOW_MS);
  const blocked = !perUser.ok ? perUser : !perIp.ok ? perIp : null;
  if (blocked) {
    const minutes = Math.ceil(blocked.retryAfterSeconds / 60);
    return {
      ok: false,
      error: "Muitas tentativas. Aguarde " + minutes + " minuto(s) e tente de novo.",
    };
  }

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

    // Login válido: a conta deixa de acumular tentativas.
    await reset(userKey);

    await createSession({
      userId: user.id,
      role: user.role,
      username: user.username,
      fullName: user.fullName,
      sector: user.sector?.label ?? null,
      avatarPath: user.avatarPath ?? null,
      accessSlugs,
      v: user.sessionVersion,
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
