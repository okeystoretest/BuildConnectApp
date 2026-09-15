"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/require-user";
import { can } from "@/lib/permissions";
import type { Role } from "@/types";
import { UPLOADS_ROOT, PUBLIC_PREFIX } from "@/lib/storage/config";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const schema = z.object({
  ticketId: z.string().min(1),
  status: z.enum(["PENDENTE", "ATRIBUIDO", "EM_ANDAMENTO", "CONCLUIDO", "CANCELADO"]),
  // Descrição técnica da solução — obrigatória ao concluir chamado de TI.
  resolutionNote: z.string().trim().optional(),
});

/**
 * Atualiza o status de um chamado (kanban de TI).
 * Marca automaticamente startedAt ao entrar em andamento e finishedAt ao
 * concluir — base da cronometragem exibida no dashboard.
 *
 * Ao concluir um chamado de TI, exige a descrição técnica da solução
 * (resolutionNote), gravada junto da transição de status.
 */
export async function updateTicketStatus(input: {
  ticketId: string;
  status: "PENDENTE" | "ATRIBUIDO" | "EM_ANDAMENTO" | "CONCLUIDO" | "CANCELADO";
  resolutionNote?: string;
}): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sessão expirada. Faça login novamente." };

  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Dados inválidos." };
  const { ticketId, status, resolutionNote } = parsed.data;

  try {
    const current = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { startedAt: true, assigneeId: true, destination: true },
    });
    if (!current) return { ok: false, error: "Chamado não encontrado." };

    // Gestão total (tickets.manage) OU o próprio responsável pelo chamado.
    const isManager = can(user.role as Role, "tickets.manage");
    const isAssignee = current.assigneeId === user.id;
    if (!isManager && !isAssignee) {
      return { ok: false, error: "Você não tem permissão para alterar este chamado." };
    }

    // "Atribuído" sem responsável é um estado que contradiz o próprio nome:
    // o card ficaria na coluna sem dono e ninguém saberia de quem cobrar. A
    // interface pede o responsável ao arrastar; aqui a regra é reforçada.
    if (status === "ATRIBUIDO" && !current.assigneeId) {
      return { ok: false, error: "Defina o responsável para mover o chamado para Atribuído." };
    }

    // Conclusão de chamado de TI exige a descrição técnica da solução.
    const isItCompletion = status === "CONCLUIDO" && current.destination === "TI";
    if (isItCompletion && (!resolutionNote || resolutionNote.length === 0)) {
      return { ok: false, error: "Descreva a solução técnica aplicada para concluir." };
    }

    const data: {
      status: typeof status;
      assigneeId?: string;
      assignedById?: string;
      startedAt?: Date;
      finishedAt?: Date | null;
      resolutionNote?: string;
    } = { status };

    // Ao entrar em andamento pela primeira vez, cronometra e atribui ao ator.
    // O atribuidor vai junto: EM_ANDAMENTO é status privado, e sem ele o card
    // sumiria do quadro de quem acabou de puxar o chamado para si.
    if (status === "EM_ANDAMENTO" && !current.startedAt) {
      data.startedAt = new Date();
      data.assigneeId = user.id;
      data.assignedById = user.id;
    }
    if (status === "CONCLUIDO") {
      data.finishedAt = new Date();
      if (isItCompletion && resolutionNote) data.resolutionNote = resolutionNote;
    }
    // Voltar para pendente limpa a atribuição implícita de andamento.
    if (status === "PENDENTE") {
      data.finishedAt = null;
    }

    await prisma.ticket.update({ where: { id: ticketId }, data });
    revalidatePath("/setores/ti");
    revalidatePath("/setores/motoristas");
    return { ok: true };
  } catch (error) {
    console.error("[updateTicketStatus] falha:", error);
    return { ok: false, error: "Não foi possível atualizar o chamado." };
  }
}

/** Converte um caminho público (/uploads/...) no caminho físico absoluto. */
function toAbsolute(publicPath: string): string | null {
  if (!publicPath.startsWith(`${PUBLIC_PREFIX}/`)) return null;
  const relative = publicPath.slice(PUBLIC_PREFIX.length + 1);
  return path.join(UPLOADS_ROOT, relative);
}

/**
 * Exclusão DEFINITIVA de um chamado. Exclusivo do Admin (tickets.manage) —
 * independe do setor ou do status. Remove o registro (o cascade do schema
 * apaga TicketImage e Trip/TripPosition, encerrando também qualquer corrida
 * em aberto) e limpa os arquivos físicos associados (anexos de abertura +
 * comprovante) do disco da VPS.
 *
 * É a ÚNICA forma de tirar um chamado do fluxo: o antigo "Cancelar chamado"
 * fazia o mesmo trabalho por outro caminho — dois botões, duas telas e duas
 * Server Actions para a mesma decisão — e foi removido.
 *
 * Ação irreversível: use com o modal de confirmação do board.
 */
export async function hardDeleteTicket(ticketId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sessão expirada. Faça login novamente." };
  if (!can(user.role as Role, "tickets.manage")) {
    return { ok: false, error: "Apenas a administração pode excluir chamados." };
  }
  if (!ticketId) return { ok: false, error: "Chamado inválido." };

  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { proofPath: true, images: { select: { filePath: true } } },
    });
    if (!ticket) return { ok: false, error: "Chamado não encontrado." };

    // Apaga o registro primeiro; só remove arquivos após o banco confirmar.
    await prisma.ticket.delete({ where: { id: ticketId } });

    const paths = [
      ...(ticket.images ?? []).map((i) => i.filePath),
      ...(ticket.proofPath ? [ticket.proofPath] : []),
    ];
    await Promise.allSettled(
      paths.map((p) => {
        const abs = toAbsolute(p);
        return abs ? unlink(abs) : Promise.resolve();
      }),
    );

    revalidatePath("/setores/ti");
    revalidatePath("/setores/motoristas");
    return { ok: true };
  } catch (e) {
    console.error("[hardDeleteTicket] db:", e);
    return { ok: false, error: "Falha ao excluir o chamado." };
  }
}

