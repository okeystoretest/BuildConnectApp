"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/require-user";
import { resolveAccessibleSlugs, canAccessSlug } from "@/lib/auth/access";
import { can } from "@/lib/permissions";
import { listDrivers } from "@/lib/tickets/actions";
import type { Role } from "@/types";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

/**
 * Atribuição de chamados (quadros de Motoristas e de Retaguarda).
 *
 * Regras de permissão:
 *  - "Atribuir para mim": qualquer usuário com tickets.claim (inclui
 *    COLABORADOR/motorista). Só pode atribuir A SI MESMO.
 *  - "Atribuir para <alguém>": exige tickets.assign (GESTOR/ADMIN).
 *  - "Desatribuir": o próprio responsável OU tickets.assign.
 *
 * Distribuir trabalho é tickets.assign, não tickets.manage. A gestão de setor
 * precisa encaminhar corrida e chamado; apagar registro em definitivo segue
 * sendo só do ADMIN.
 *
 * Atribuir move PENDENTE → ATRIBUIDO; desatribuir volta a PENDENTE e limpa
 * a atribuição. Nenhuma das duas mexe em cronometragem (isso é do "Iniciar").
 */

const assignSchema = z.object({
  ticketId: z.string().min(1),
  /** Ausente/null = atribuir para o próprio ator ("para mim"). */
  assigneeId: z.string().min(1).nullable().optional(),
});

export async function assignTicket(input: {
  ticketId: string;
  assigneeId?: string | null;
}): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sessão expirada. Faça login novamente." };

  const parsed = assignSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Dados inválidos." };
  const { ticketId } = parsed.data;

  const role = user.role as Role;
  const targetId = parsed.data.assigneeId ?? user.id;
  const isSelf = targetId === user.id;

  // Atribuir para si exige claim; atribuir para outro exige assign.
  if (isSelf) {
    if (!can(role, "tickets.claim")) {
      return { ok: false, error: "Você não pode assumir chamados." };
    }
  } else if (!can(role, "tickets.assign")) {
    return { ok: false, error: "Só a gestão pode atribuir a outra pessoa." };
  }

  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { id: true, status: true, destination: true },
    });
    if (!ticket) return { ok: false, error: "Chamado não encontrado." };
    if (ticket.status === "CONCLUIDO" || ticket.status === "CANCELADO") {
      return { ok: false, error: "Chamado já encerrado." };
    }

    // Assumir exige a MESMA lotação que ler o quadro. Sem isto, a permissão de
    // papel (tickets.claim, que todo colaborador tem) bastava para assumir
    // chamado de um setor que a pessoa nem enxerga — e, como responsável, ela
    // passaria a poder mudar status e concluir.
    const slugDoQuadro = ticket.destination === "MOTORISTAS" ? "motoristas" : "ti";
    const slugs = await resolveAccessibleSlugs(user.id, role);
    if (!canAccessSlug(slugs, slugDoQuadro)) {
      return { ok: false, error: "Você não tem acesso ao quadro deste chamado." };
    }

    // Se atribui para outro, confirma que o alvo existe e está ativo.
    if (!isSelf) {
      const target = await prisma.user.findUnique({
        where: { id: targetId },
        select: { active: true },
      });
      if (!target || !target.active) {
        return { ok: false, error: "Responsável inválido." };
      }
    }

    // assignedById é quem executou a ação, não o alvo. Na auto-atribuição os
    // dois coincidem; quando a gestão designa outra pessoa, é o que mantém o
    // chamado visível para quem o distribuiu (ver `lib/ticket-visibility`).
    await prisma.ticket.update({
      where: { id: ticketId },
      data: { assigneeId: targetId, assignedById: user.id, status: "ATRIBUIDO" },
    });

    revalidatePath("/setores/motoristas");
    revalidatePath("/setores/ti");
    return { ok: true };
  } catch (error) {
    console.error("[assignTicket] falha:", error);
    return { ok: false, error: "Não foi possível atribuir o chamado." };
  }
}

const unassignSchema = z.object({ ticketId: z.string().min(1) });

export async function unassignTicket(input: { ticketId: string }): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sessão expirada. Faça login novamente." };

  const parsed = unassignSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Dados inválidos." };
  const { ticketId } = parsed.data;

  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { assigneeId: true, status: true, startedAt: true },
    });
    if (!ticket) return { ok: false, error: "Chamado não encontrado." };

    const canAssign = can(user.role as Role, "tickets.assign");
    const isAssignee = ticket.assigneeId === user.id;
    if (!canAssign && !isAssignee) {
      return { ok: false, error: "Você não pode desatribuir este chamado." };
    }
    // Depois de iniciada a corrida, desatribuir não faz sentido pelo botão —
    // o fluxo esperado é concluir. Bloqueia para evitar órfãos de tracking.
    if (ticket.status === "EM_ANDAMENTO") {
      return { ok: false, error: "Chamado em andamento — conclua a corrida." };
    }

    // Volta a ser público: limpa também o atribuidor, senão quem atribuiu
    // continuaria "parte" de um chamado que ninguém assumiu.
    await prisma.ticket.update({
      where: { id: ticketId },
      data: { assigneeId: null, assignedById: null, status: "PENDENTE" },
    });

    revalidatePath("/setores/motoristas");
    revalidatePath("/setores/ti");
    return { ok: true };
  } catch (error) {
    console.error("[unassignTicket] falha:", error);
    return { ok: false, error: "Não foi possível desatribuir o chamado." };
  }
}

/**
 * Pessoas atribuíveis a um chamado, para o seletor "Atribuir para…" e para a
 * atribuição exigida ao mover um card para "Atribuído".
 *
 * Só quem tem tickets.assign pode escolher outra pessoa; para os demais a
 * lista volta vazia e o modal oferece apenas "Atribuir para mim".
 *
 * No quadro de MOTORISTAS a lista é a dos motoristas — usuários lotados em
 * Logística › Motoristas, o mesmo recorte do seletor de abertura de chamado.
 * Sem o destino a lista sairia com a empresa inteira, e daria para encaminhar
 * uma entrega a alguém do Marketing.
 */
export async function listAssignableUsers(
  destination?: "TI" | "MOTORISTAS",
): Promise<{ id: string; name: string }[]> {
  const user = await getCurrentUser();
  if (!user || !can(user.role as Role, "tickets.assign")) return [];

  if (destination === "MOTORISTAS") {
    return listDrivers();
  }

  const people = await prisma.user.findMany({
    where: { active: true },
    select: { id: true, fullName: true },
    orderBy: { fullName: "asc" },
  });
  return people.map((p) => ({ id: p.id, name: p.fullName }));
}
