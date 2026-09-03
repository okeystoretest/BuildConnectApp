import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/require-user";
import { countMyPendingEvaluations } from "@/lib/evaluation-rounds";

export const dynamic = "force-dynamic";

/**
 * Contador de avaliações pendentes do usuário logado — o número do indicador
 * vermelho na barra lateral.
 *
 * Devolve só um inteiro: nem nome de avaliado, nem instrumento, nem rodada.
 * Quem quer a lista abre /minhas-avaliacoes, que é onde o RBAC da tela vale.
 *
 * getCurrentUser (e não getSession) para que conta desativada ou sessão
 * revogada pare de contar na hora, sem esperar o cookie vencer.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  try {
    const count = await countMyPendingEvaluations(user.id);
    return NextResponse.json({ count }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[api/avaliacoes/pendentes] falha:", e);
    return NextResponse.json({ error: "Falha ao contar as pendências." }, { status: 500 });
  }
}
