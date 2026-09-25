"use server";

import { z } from "zod";
import { requireDhoAdmin } from "@/lib/hr-actions-history";
import { getActivityPage } from "@/lib/activity-timeline-data";
import type { ActivityCursor, ActivityItem } from "@/lib/activity-timeline";

export interface ActivityPageResult {
  ok: boolean;
  events?: ActivityItem[];
  nextCursor?: ActivityCursor | null;
  error?: string;
}

const schema = z.object({
  userId: z.string().min(1),
  cursor: z.object({ occurredAt: z.string().datetime(), id: z.string().min(1) }).nullish(),
});

/**
 * Próxima página da linha do tempo de um colaborador ("carregar mais").
 *
 * O cursor vem do cliente, então é validado como qualquer entrada: uma data
 * que não é data viraria `Invalid Date` e a janela da consulta pararia de
 * filtrar, devolvendo a linha do tempo inteira. A permissão é revalidada aqui
 * — a tela ter escondido o bloco não é a trava.
 */
export async function fetchActivityPage(input: {
  userId: string;
  cursor?: ActivityCursor | null;
}): Promise<ActivityPageResult> {
  const denied = await requireDhoAdmin();
  if (denied) return { ok: false, error: denied };

  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Consulta inválida." };

  const page = await getActivityPage({
    userId: parsed.data.userId,
    cursor: parsed.data.cursor ?? null,
  });
  return { ok: true, events: page.events, nextCursor: page.nextCursor };
}
