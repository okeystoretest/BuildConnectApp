import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/require-user";
import { listMyNotifications } from "@/lib/notifications/data";
import type { Role } from "@/types";

export const dynamic = "force-dynamic";

/**
 * O sino do usuário logado — o que o polling do `NotificationProvider` lê.
 *
 * Já sai recortado no servidor: audiência, alvo individual e o que ele
 * limpou nunca chegam ao cliente. getCurrentUser (e não getSession) para que
 * conta desativada pare de receber na hora.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  try {
    const items = await listMyNotifications(user.id, user.role as Role);
    return NextResponse.json({ items }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[api/notificacoes] falha:", e);
    return NextResponse.json({ error: "Falha ao listar as notificações." }, { status: 500 });
  }
}
