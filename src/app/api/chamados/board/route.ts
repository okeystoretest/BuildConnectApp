import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/require-user";
import { resolveAccessibleSlugs, canAccessSlug } from "@/lib/auth/access";
import { getItTickets } from "@/lib/it-data-db";
import { getDriverTickets } from "@/lib/driver-data-db";
import type { Role } from "@/types";
import type { ItTicket } from "@/types/it";

export const dynamic = "force-dynamic";

/**
 * Leitura dos chamados de um board (TI ou Motoristas) para sincronização
 * "quase em tempo real" via polling no cliente. Devolve os mesmos DTOs que
 * a página server-side monta na carga inicial, já com anexos e comprovante.
 *
 * Autorização: a MESMA da página que este endpoint abastece — RBAC por
 * subsetor ("ti" ou "motoristas"). Antes bastava estar logado, enquanto a tela
 * exigia o setor: quem não tinha acesso à página lia o mesmo conteúdo por aqui
 * (título, descrição, solicitante, nota técnica e links dos anexos).
 * getCurrentUser em vez de getSession para que usuário desativado perca o
 * acesso na hora, sem esperar o cookie vencer.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const destination = (searchParams.get("destination") ?? "TI").toUpperCase();

  const slugs = await resolveAccessibleSlugs(user.id, user.role as Role);

  try {
    let tickets: ItTicket[];
    if (destination === "MOTORISTAS") {
      if (!canAccessSlug(slugs, "motoristas")) {
        return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
      }
      tickets = await getDriverTickets();
    } else if (destination === "TI") {
      if (!canAccessSlug(slugs, "ti")) {
        return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
      }
      // Mesmo recorte de privacidade da página: chamado atribuído a terceiro
      // não sai daqui. Antes o endpoint devolvia o quadro inteiro e a
      // ocultação era só visual, no navegador de quem recebia tudo.
      tickets = await getItTickets({ id: user.id, role: user.role });
    } else {
      return NextResponse.json({ error: "Destino inválido." }, { status: 400 });
    }
    return NextResponse.json({ tickets }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[api/chamados/board] falha:", e);
    return NextResponse.json({ error: "Falha ao carregar os chamados." }, { status: 500 });
  }
}
