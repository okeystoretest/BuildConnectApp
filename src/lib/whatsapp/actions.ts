"use server";

import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/require-user";
import { can } from "@/lib/permissions";
import { connectionInfo, resetSession, type ConnectionInfo } from "./connection";
import { drainOutbox } from "./outbox";
import type { Role } from "@/types";

/**
 * Administração da conexão do WhatsApp.
 *
 * Tudo aqui exige `users.manage`. É a permissão certa e não `forms.manage`:
 * quem pareia o número, desvincula e lê o log de envios está mexendo na
 * credencial da empresa, não em formulário. Gestor cria pesquisa; só o admin
 * troca o chip.
 */

async function requireAdmin(): Promise<boolean> {
  const user = await getCurrentUser();
  return Boolean(user && can(user.role as Role, "users.manage"));
}

export async function getWhatsappStatus(): Promise<ConnectionInfo> {
  if (!(await requireAdmin())) return { state: "desligado" };
  return connectionInfo();
}

export async function unlinkWhatsapp(): Promise<{ ok: boolean; error?: string }> {
  if (!(await requireAdmin())) return { ok: false, error: "Sem permissão." };
  try {
    await resetSession();
    return { ok: true };
  } catch (e) {
    console.error("[whatsapp] falha ao desvincular:", e);
    return { ok: false, error: "Não foi possível desvincular." };
  }
}

export interface WhatsappLogRow {
  id: string;
  name: string;
  kind: "AVALIACAO" | "FORMULARIO";
  status: "PENDENTE" | "ENVIADO" | "FALHOU";
  error?: string;
  when: string;
}

function label(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * As últimas mensagens, por destinatário.
 *
 * Devolve NOME, nunca telefone. O log existe para responder "fulano recebeu?"
 * — e essa pergunta se responde pelo nome. Repetir o número aqui só criaria
 * mais um lugar de onde ele pode vazar.
 */
export async function getWhatsappLog(limit = 50): Promise<WhatsappLogRow[]> {
  if (!(await requireAdmin())) return [];

  const rows = await prisma.whatsappMessage.findMany({
    orderBy: { createdAt: "desc" },
    take: Math.min(limit, 200),
    select: {
      id: true,
      kind: true,
      status: true,
      error: true,
      createdAt: true,
      sentAt: true,
      user: { select: { fullName: true } },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    name: r.user.fullName,
    kind: r.kind,
    status: r.status,
    error: r.error ?? undefined,
    when: label(r.sentAt ?? r.createdAt),
  }));
}

/**
 * Devolve as falhas à fila.
 *
 * Sem isto, o log seria uma lista que não se pode fazer nada a respeito: uma
 * mensagem que falhou por telefone errado continuaria FALHOU para sempre,
 * mesmo depois de o cadastro ser corrigido. As tentativas voltam a zero
 * porque o motivo da falha anterior deixou de valer.
 */
export async function retryFailedWhatsapp(): Promise<{ ok: boolean; requeued: number }> {
  if (!(await requireAdmin())) return { ok: false, requeued: 0 };

  const { count } = await prisma.whatsappMessage.updateMany({
    where: { status: "FALHOU" },
    data: { status: "PENDENTE", attempts: 0, error: null },
  });
  return { ok: true, requeued: count };
}

/** Drena a fila agora, sem esperar o cron. */
export async function drainWhatsappNow(): Promise<{ ok: boolean; enviados: number; falhas: number }> {
  if (!(await requireAdmin())) return { ok: false, enviados: 0, falhas: 0 };
  const res = await drainOutbox({ limit: 10 });
  return { ok: true, enviados: res.enviados, falhas: res.falhas };
}
