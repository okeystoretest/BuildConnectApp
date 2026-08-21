"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/require-user";
import { geocodeTripEndpoints } from "@/lib/tracking/geocode";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

/**
 * Inicia a corrida de um chamado de Motoristas.
 *
 * Só o motorista ATRIBUÍDO ao chamado pode iniciar. Cria o Trip em EM_ROTA,
 * geocodifica origem/destino uma única vez (persistindo o resultado) e marca
 * Ticket.startedAt. Idempotente: se o Trip já existe, apenas confirma.
 *
 * A geocodificação acontece FORA da transação — é rede externa, pode
 * demorar/falhar, e o fallback (sem pino) é aceitável. Só a escrita no banco
 * é atômica.
 */
export async function startTrip(input: { ticketId: string }): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sessão expirada. Faça login novamente." };

  const parsed = z.object({ ticketId: z.string().min(1) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Chamado inválido." };
  const { ticketId } = parsed.data;

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: {
      id: true,
      destination: true,
      status: true,
      assigneeId: true,
      departureStreet: true,
      departureNumber: true,
      departureDistrict: true,
      destStreet: true,
      destNumber: true,
      destDistrict: true,
      trip: { select: { id: true } },
    },
  });

  if (!ticket) return { ok: false, error: "Chamado não encontrado." };
  if (ticket.destination !== "MOTORISTAS") {
    return { ok: false, error: "Só chamados de Motoristas têm rota." };
  }
  if (ticket.assigneeId !== user.id) {
    return { ok: false, error: "Apenas o motorista responsável pode iniciar a corrida." };
  }
  if (ticket.status === "CONCLUIDO" || ticket.status === "CANCELADO") {
    return { ok: false, error: "Chamado já encerrado." };
  }
  if (ticket.trip) {
    // Já iniciada — não duplica o Trip, mas garante o status EM_ANDAMENTO
    // (auto-correção para chamados iniciados antes desta correção).
    if (ticket.status !== "EM_ANDAMENTO") {
      await prisma.ticket.update({
        where: { id: ticketId },
        data: { status: "EM_ANDAMENTO" },
      });
      revalidatePath("/setores/motoristas");
      revalidatePath("/chamados");
    }
    return { ok: true };
  }

  // Geocodificação fora da transação (rede externa, tolerante a falha).
  const coords = await geocodeTripEndpoints(
    {
      street: ticket.departureStreet,
      number: ticket.departureNumber,
      district: ticket.departureDistrict,
    },
    { street: ticket.destStreet, number: ticket.destNumber, district: ticket.destDistrict },
  );

  const originLabel =
    [ticket.departureStreet, ticket.departureNumber, ticket.departureDistrict]
      .filter(Boolean)
      .join(", ") || "Origem não informada";
  const destLabel =
    [ticket.destStreet, ticket.destNumber, ticket.destDistrict].filter(Boolean).join(", ") ||
    "Destino não informado";

  try {
    await prisma.$transaction(async (tx) => {
      await tx.trip.create({
        data: {
          ticketId,
          status: "EM_ROTA",
          originLat: coords.origin?.lat ?? null,
          originLng: coords.origin?.lng ?? null,
          originLabel,
          destLat: coords.destination?.lat ?? null,
          destLng: coords.destination?.lng ?? null,
          destLabel,
          startedAt: new Date(),
        },
      });
      // Espelha o início no Ticket: status EM_ANDAMENTO (o kanban deriva a
      // coluna do status do Ticket) + cronometragem (startedAt). Sem mudar o
      // status aqui, o card voltava para "Atribuído" ao recarregar.
      await tx.ticket.update({
        where: { id: ticketId },
        data: { status: "EM_ANDAMENTO", startedAt: new Date() },
      });
    });

    revalidatePath("/setores/motoristas");
    revalidatePath("/chamados");
    return { ok: true };
  } catch (error) {
    console.error("[startTrip] falha:", error);
    return { ok: false, error: "Não foi possível iniciar a corrida." };
  }
}

const positionSchema = z.object({
  ticketId: z.string().min(1),
  lat: z.number().gte(-90).lte(90),
  lng: z.number().gte(-180).lte(180),
  heading: z.number().gte(0).lt(360).optional(),
  speed: z.number().gte(0).lte(400).optional(),
});

/**
 * Registra uma posição GPS do motorista durante a corrida.
 *
 * Só o motorista atribuído, e só enquanto a corrida está EM_ROTA. O throttle
 * fica no cliente (tempo/distância mínimos) — aqui apenas validamos e
 * gravamos. Uma corrida encerrada ignora posições tardias silenciosamente
 * (ok: true) para não gerar erro no app do motorista offline/atrasado.
 */
export async function pushTripPosition(input: {
  ticketId: string;
  lat: number;
  lng: number;
  heading?: number;
  speed?: number;
}): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sessão expirada." };

  const parsed = positionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Posição inválida." };
  const { ticketId, lat, lng, heading, speed } = parsed.data;

  const trip = await prisma.trip.findUnique({
    where: { ticketId },
    select: { id: true, status: true, ticket: { select: { assigneeId: true } } },
  });

  if (!trip) return { ok: false, error: "Corrida não iniciada." };
  if (trip.ticket.assigneeId !== user.id) {
    return { ok: false, error: "Apenas o motorista responsável envia posição." };
  }
  // Corrida encerrada: aceita sem gravar (evita ruído no app do motorista).
  if (trip.status !== "EM_ROTA") return { ok: true };

  try {
    await prisma.tripPosition.create({
      data: { tripId: trip.id, lat, lng, heading, speed },
    });
    return { ok: true };
  } catch (error) {
    console.error("[pushTripPosition] falha:", error);
    return { ok: false, error: "Não foi possível registrar a posição." };
  }
}
