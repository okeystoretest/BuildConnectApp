import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { toAbsolutePath } from "@/lib/storage/config";
import { buildCreatePayload } from "./payload";
import { createFlowTransport, getFlowTransport, FlowUnavailableError } from "./client";
import { mirrorUpdate } from "./mirror";

/**
 * Envio e reconciliação do chamado de Motoristas com o Build.Flow.
 *
 * `syncTicketToFlow` roda logo após a gravação local. Se o Flow não responder,
 * o Ticket fica com `flowSyncError` e `resyncPendingTickets` (cron) tenta de
 * novo — o POST do Flow é idempotente por connectId, então repetir é seguro.
 */
export async function syncTicketToFlow(ticketId: string): Promise<void> {
  const t = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: {
      id: true, code: true, destination: true, flowId: true,
      serviceType: true, description: true, contact: true,
      departureStreet: true, departureNumber: true, departureDistrict: true,
      destStreet: true, destNumber: true, destDistrict: true,
      // Motorista escolhido na abertura (id do Flow), até o envio acontecer.
      flowDriverId: true,
      requester: { select: { id: true, fullName: true, sector: { select: { label: true } } } },
      images: { orderBy: { order: "asc" }, select: { filePath: true } },
    },
  });
  if (!t || t.destination !== "MOTORISTAS" || t.flowId) return;

  const payload = buildCreatePayload(
    t,
    { id: t.requester.id, name: t.requester.fullName, sector: t.requester.sector?.label ?? null },
    t.flowDriverId,
  );
  const images: { absolutePath: string; fileName: string }[] = [];
  t.images.forEach((img, i) => {
    const absolutePath = toAbsolutePath(img.filePath);
    if (absolutePath) images.push({ absolutePath, fileName: `${t.code}-${i + 1}.webp` });
  });

  try {
    const created = await createFlowTransport(payload, images);
    await prisma.ticket.update({
      where: { id: t.id },
      data: {
        flowId: created.id,
        flowSyncedAt: new Date(),
        flowSyncError: null,
        externalAssigneeName: created.driver?.name ?? null,
        status: created.driver ? "ATRIBUIDO" : "PENDENTE",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha ao enviar ao Build.Flow.";
    await prisma.ticket.update({ where: { id: t.id }, data: { flowSyncError: msg } });
    if (!(e instanceof FlowUnavailableError)) console.error("[flow/sync] envio recusado:", e);
  }
}

/** Reenvia os que ainda não chegaram ao Flow. Chamado pelo cron. */
export async function resyncPendingTickets(): Promise<{ sent: number; failed: number }> {
  const pendentes = await prisma.ticket.findMany({
    where: { destination: "MOTORISTAS", flowId: null, status: { notIn: ["CONCLUIDO", "CANCELADO"] } },
    select: { id: true },
    orderBy: { createdAt: "asc" },
    take: 50,
  });
  let sent = 0;
  let failed = 0;
  for (const p of pendentes) {
    await syncTicketToFlow(p.id);
    const after = await prisma.ticket.findUnique({ where: { id: p.id }, select: { flowId: true } });
    if (after?.flowId) sent += 1;
    else failed += 1;
  }
  if (sent + failed > 0) revalidatePath("/chamados");
  return { sent, failed };
}

/** Reconsulta o Flow e aplica o estado no espelho. Silencioso se o Flow estiver fora. */
export async function reconcileTicket(ticketId: string): Promise<void> {
  try {
    const state = await getFlowTransport(ticketId);
    if (!state) return;
    await prisma.ticket.update({ where: { id: ticketId }, data: mirrorUpdate(state) });
  } catch (e) {
    if (!(e instanceof FlowUnavailableError)) console.error("[flow/sync] reconciliação falhou:", e);
  }
}
